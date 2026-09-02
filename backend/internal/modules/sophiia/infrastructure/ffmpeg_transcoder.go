package infrastructure

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type FFmpegTranscoder struct{}

func NewFFmpegTranscoder() *FFmpegTranscoder {
	return &FFmpegTranscoder{}
}

// TranscodeToHLS converte um arquivo MP4 local para estrutura HLS multi-bitrate (.m3u8 e .ts)
// em outputDir.
func (t *FFmpegTranscoder) TranscodeToHLS(ctx context.Context, inputFilePath, outputDir string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output dir: %w", err)
	}

	masterM3u8Path := filepath.Join(outputDir, "master.m3u8")

	// Vídeo sem faixa de áudio é comum (screencast mudo, captura de tela):
	// mapear "0:a:0" fixo faz o FFmpeg abortar com "Stream map '0:a:0'
	// matches no streams" (exit 234). Detecta a faixa antes e monta os
	// argumentos com ou sem áudio.
	withAudio := t.hasAudioStream(ctx, inputFilePath)
	args := buildHLSArgs(inputFilePath, outputDir, withAudio)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("ffmpeg execution failed (%v): %s", err, string(output))
	}

	return masterM3u8Path, nil
}

// buildHLSArgs monta a linha de comando do FFmpeg para a transcodificação
// HLS multi-bitrate (1080p / 720p / 480p). Função pura (sem I/O) para ser
// testável: o único ramo com lógica de verdade é withAudio — sem áudio,
// nenhum "-map 0:a:0", nenhum "-c:a", e o var_stream_map perde os "a:N",
// senão o FFmpeg aborta a transcodificação inteira.
func buildHLSArgs(inputFilePath, outputDir string, withAudio bool) []string {
	args := []string{
		"-y",
		"-i", inputFilePath,
		"-preset", "fast",
		"-g", "48", "-sc_threshold", "0",
	}
	if withAudio {
		args = append(args,
			"-map", "0:v:0", "-map", "0:a:0",
			"-map", "0:v:0", "-map", "0:a:0",
			"-map", "0:v:0", "-map", "0:a:0",
			"-c:v", "libx264", "-c:a", "aac", "-ar", "48000",
		)
	} else {
		args = append(args,
			"-map", "0:v:0",
			"-map", "0:v:0",
			"-map", "0:v:0",
			"-c:v", "libx264",
		)
	}
	args = append(args,
		// 1080p
		"-b:v:0", "5000k", "-maxrate:v:0", "5350k", "-bufsize:v:0", "7500k", "-s:v:0", "1920x1080",
		// 720p
		"-b:v:1", "2800k", "-maxrate:v:1", "2996k", "-bufsize:v:1", "4200k", "-s:v:1", "1280x720",
		// 480p
		"-b:v:2", "1400k", "-maxrate:v:2", "1498k", "-bufsize:v:2", "2100k", "-s:v:2", "854x480",
	)
	if withAudio {
		args = append(args, "-var_stream_map", "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p")
	} else {
		args = append(args, "-var_stream_map", "v:0,name:1080p v:1,name:720p v:2,name:480p")
	}
	return append(args,
		"-master_pl_name", "master.m3u8",
		"-f", "hls",
		"-hls_time", "6",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(outputDir, "%v_segment_%03d.ts"),
		filepath.Join(outputDir, "%v.m3u8"),
	)
}

// hasAudioStream devolve true se o arquivo tem ao menos uma faixa de
// áudio. Em qualquer erro do ffprobe assume que NÃO tem — o caminho sem
// áudio é o mais seguro (o com áudio aborta a transcodificação inteira se
// a faixa não existir; o sem áudio só perde o áudio de um vídeo que o
// tivesse, o que o ffprobe falhando torna improvável).
func (t *FFmpegTranscoder) hasAudioStream(ctx context.Context, inputFilePath string) bool {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-select_streams", "a",
		"-show_entries", "stream=index",
		"-of", "csv=p=0",
		inputFilePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) != ""
}

// ProbeDurationSeconds usa o ffprobe para ler a duração do arquivo em
// segundos (arredondada). Retorna 0 sem erro se o ffprobe não conseguir
// determinar — a duração é um dado de conveniência (exibição no player),
// não deve derrubar a transcodificação.
func (t *FFmpegTranscoder) ProbeDurationSeconds(ctx context.Context, inputFilePath string) int {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		inputFilePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	secs, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil || secs < 0 {
		return 0
	}
	return int(secs + 0.5)
}
