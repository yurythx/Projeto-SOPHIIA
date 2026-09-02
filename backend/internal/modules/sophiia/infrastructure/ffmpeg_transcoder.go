package infrastructure

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
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

// rung é um degrau da escada HLS: resolução-alvo (altura, largura vem de
// scale=-2 preservando o aspecto) e o orçamento de bitrate do x264.
type rung struct {
	name    string
	height  int
	bitrate string
	maxrate string
	bufsize string
}

// hlsLadder é a escada completa. pickLadder corta os degraus acima da
// resolução do vídeo de origem — nunca fazer upscale (custa CPU à toa e
// piora a imagem) foi a causa de transcodificações de 25 min nesta base.
var hlsLadder = []rung{
	{name: "1080p", height: 1080, bitrate: "5000k", maxrate: "5350k", bufsize: "7500k"},
	{name: "720p", height: 720, bitrate: "2800k", maxrate: "2996k", bufsize: "4200k"},
	{name: "480p", height: 480, bitrate: "1400k", maxrate: "1498k", bufsize: "2100k"},
}

// pickLadder devolve os degraus <= altura da origem. srcHeight<=0 (probe
// falhou) => um único degrau 720p, com o filtro scale limitado a não
// passar da origem. Nenhum degrau elegível (origem < 480p) => um degrau
// na própria resolução da origem.
func pickLadder(srcHeight int) []rung {
	if srcHeight <= 0 {
		return []rung{{name: "720p", height: 720, bitrate: "2800k", maxrate: "2996k", bufsize: "4200k"}}
	}
	var out []rung
	for _, r := range hlsLadder {
		if r.height <= srcHeight {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return []rung{{name: fmt.Sprintf("%dp", srcHeight), height: srcHeight, bitrate: "1200k", maxrate: "1284k", bufsize: "1800k"}}
	}
	return out
}

// TranscodeToHLS converte um MP4 local em HLS multi-bitrate (.m3u8/.ts) em
// outputDir. onProgress (opcional) recebe o percentual 0..100 conforme o
// FFmpeg avança — para o Studio mostrar barra de progresso em vez de um
// spinner indefinido.
func (t *FFmpegTranscoder) TranscodeToHLS(ctx context.Context, inputFilePath, outputDir string, onProgress func(percent int)) (string, error) {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create output dir: %w", err)
	}
	masterM3u8Path := filepath.Join(outputDir, "master.m3u8")

	durationSecs := t.ProbeDurationSeconds(ctx, inputFilePath)
	// Vídeo sem faixa de áudio é comum (screencast mudo): mapear "0:a:0"
	// fixo aborta o FFmpeg (exit 234). Detecta antes.
	withAudio := t.hasAudioStream(ctx, inputFilePath)
	ladder := pickLadder(t.probeVideoHeight(ctx, inputFilePath))
	args := buildHLSArgs(inputFilePath, outputDir, ladder, withAudio)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("ffmpeg stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("ffmpeg start: %w", err)
	}
	parseFFmpegProgress(stdout, durationSecs, onProgress)
	if err := cmd.Wait(); err != nil {
		return "", fmt.Errorf("ffmpeg execution failed (%v): %s", err, tail(stderr.String(), 800))
	}
	if onProgress != nil {
		onProgress(100)
	}
	return masterM3u8Path, nil
}

// parseFFmpegProgress lê o fluxo `-progress pipe:1` (blocos "chave=valor",
// terminando com "progress=end") e converte out_time_us em percentual.
// Bloqueia até o stream fechar (fim do FFmpeg) — sempre drena o pipe,
// senão o FFmpeg trava ao escrever nele.
func parseFFmpegProgress(r io.Reader, durationSecs int, onProgress func(percent int)) {
	if onProgress == nil || durationSecs <= 0 {
		_, _ = io.Copy(io.Discard, r)
		return
	}
	sc := bufio.NewScanner(r)
	last := -1
	for sc.Scan() {
		v, ok := strings.CutPrefix(sc.Text(), "out_time_us=")
		if !ok {
			continue
		}
		us, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			continue
		}
		pct := int(us / 10000 / int64(durationSecs)) // us/1e6 / dur * 100
		if pct > 99 {
			pct = 99
		}
		if pct > last {
			last = pct
			onProgress(pct)
		}
	}
}

// buildHLSArgs monta a linha de comando do FFmpeg. Função pura (sem I/O),
// testável. ladder já vem cortado (só downscale). Sem áudio: nenhum
// "-map 0:a:0"/"-c:a" e o var_stream_map perde os "a:N".
func buildHLSArgs(inputFilePath, outputDir string, ladder []rung, withAudio bool) []string {
	args := []string{
		"-hide_banner", "-nostats",
		"-y",
		"-i", inputFilePath,
		"-progress", "pipe:1",
		"-preset", "veryfast",
		"-threads", "0",
		"-g", "48", "-sc_threshold", "0",
	}

	var streamMap []string
	for i, r := range ladder {
		idx := strconv.Itoa(i)
		args = append(args, "-map", "0:v:0")
		if withAudio {
			args = append(args, "-map", "0:a:0")
		}
		args = append(args,
			"-filter:v:"+idx, "scale=-2:"+strconv.Itoa(r.height),
			"-c:v:"+idx, "libx264",
			"-b:v:"+idx, r.bitrate, "-maxrate:v:"+idx, r.maxrate, "-bufsize:v:"+idx, r.bufsize,
		)
		if withAudio {
			streamMap = append(streamMap, fmt.Sprintf("v:%d,a:%d,name:%s", i, i, r.name))
		} else {
			streamMap = append(streamMap, fmt.Sprintf("v:%d,name:%s", i, r.name))
		}
	}
	if withAudio {
		args = append(args, "-c:a", "aac", "-ar", "48000")
	}

	return append(args,
		"-var_stream_map", strings.Join(streamMap, " "),
		"-master_pl_name", "master.m3u8",
		"-f", "hls",
		"-hls_time", "6",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(outputDir, "%v_segment_%03d.ts"),
		filepath.Join(outputDir, "%v.m3u8"),
	)
}

// tail devolve os últimos n caracteres de s (mensagens de erro do FFmpeg
// são longas; o que importa está no fim).
func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}

// hasAudioStream devolve true se o arquivo tem ao menos uma faixa de
// áudio. Qualquer erro do ffprobe => assume que NÃO tem (caminho seguro:
// o ramo com áudio aborta tudo se a faixa não existir).
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

// probeVideoHeight lê a altura em pixels da 1ª faixa de vídeo. 0 em
// qualquer erro (pickLadder trata como "resolução desconhecida").
func (t *FFmpegTranscoder) probeVideoHeight(ctx context.Context, inputFilePath string) int {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=height",
		"-of", "default=noprint_wrappers=1:nokey=1",
		inputFilePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	h, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil || h < 0 {
		return 0
	}
	return h
}

// ProbeDurationSeconds usa o ffprobe para ler a duração do arquivo em
// segundos (arredondada). Retorna 0 sem erro se o ffprobe não conseguir
// determinar — a duração é um dado de conveniência.
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
