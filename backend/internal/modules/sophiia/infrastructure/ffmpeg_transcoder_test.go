package infrastructure

import (
	"slices"
	"strings"
	"testing"
)

// countMap conta quantas vezes "-map <target>" aparece nos args.
func countMap(args []string, target string) int {
	n := 0
	for i := 0; i+1 < len(args); i++ {
		if args[i] == "-map" && args[i+1] == target {
			n++
		}
	}
	return n
}

func varStreamMap(t *testing.T, args []string) string {
	t.Helper()
	i := slices.Index(args, "-var_stream_map")
	if i == -1 || i+1 >= len(args) {
		t.Fatal("buildHLSArgs: sem -var_stream_map nos argumentos")
	}
	return args[i+1]
}

func TestBuildHLSArgs_WithAudio_MapsAudioAndEncodesAAC(t *testing.T) {
	args := buildHLSArgs("/in/raw.mp4", "/out", true)

	if got := countMap(args, "0:v:0"); got != 3 {
		t.Errorf("-map 0:v:0 aparece %d vezes, esperado 3 (uma por rendition)", got)
	}
	if got := countMap(args, "0:a:0"); got != 3 {
		t.Errorf("-map 0:a:0 aparece %d vezes, esperado 3", got)
	}
	if !slices.Contains(args, "aac") {
		t.Error("faltou o codec de áudio (-c:a aac) no ramo com áudio")
	}
	if vsm := varStreamMap(t, args); vsm != "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p" {
		t.Errorf("var_stream_map = %q, esperado com trilhas de áudio", vsm)
	}
}

func TestBuildHLSArgs_NoAudio_OmitsEveryAudioReference(t *testing.T) {
	args := buildHLSArgs("/in/raw.mp4", "/out", false)

	// Nenhuma referência a áudio — é isso que impedia o exit 234
	// ("Stream map '0:a:0' matches no streams") em vídeo mudo.
	if countMap(args, "0:a:0") != 0 {
		t.Error("ramo sem áudio não pode conter -map 0:a:0")
	}
	if slices.Contains(args, "aac") || slices.Contains(args, "-c:a") {
		t.Error("ramo sem áudio não pode setar codec de áudio")
	}
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "a:0") || strings.Contains(joined, "a:1") || strings.Contains(joined, "a:2") {
		t.Errorf("ramo sem áudio ainda referencia trilha de áudio em algum lugar: %s", joined)
	}
	if vsm := varStreamMap(t, args); vsm != "v:0,name:1080p v:1,name:720p v:2,name:480p" {
		t.Errorf("var_stream_map = %q, esperado só vídeo", vsm)
	}
	// As 3 renditions de vídeo continuam lá.
	if got := countMap(args, "0:v:0"); got != 3 {
		t.Errorf("-map 0:v:0 aparece %d vezes, esperado 3", got)
	}
}

func TestBuildHLSArgs_CommonInvariants(t *testing.T) {
	for _, withAudio := range []bool{true, false} {
		args := buildHLSArgs("/in/raw.mp4", "/out/dir", withAudio)
		for _, want := range []string{"-i", "/in/raw.mp4", "-f", "hls", "-master_pl_name", "master.m3u8"} {
			if !slices.Contains(args, want) {
				t.Errorf("withAudio=%v: falta %q nos args", withAudio, want)
			}
		}
		if last := args[len(args)-1]; last != "/out/dir/%v.m3u8" {
			t.Errorf("withAudio=%v: último arg = %q, esperado o template de saída", withAudio, last)
		}
	}
}
