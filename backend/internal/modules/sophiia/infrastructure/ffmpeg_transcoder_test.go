package infrastructure

import (
	"slices"
	"strings"
	"testing"
)

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
		t.Fatal("buildHLSArgs: sem -var_stream_map")
	}
	return args[i+1]
}

// ---- pickLadder: nunca faz upscale ----

func TestPickLadder_DropsRungsAboveSource(t *testing.T) {
	cases := []struct {
		src   int
		names []string
	}{
		{src: 2160, names: []string{"1080p", "720p", "480p"}}, // 4K: escada cheia
		{src: 1080, names: []string{"1080p", "720p", "480p"}},
		{src: 900, names: []string{"720p", "480p"}}, // corta 1080p
		{src: 720, names: []string{"720p", "480p"}},
		{src: 500, names: []string{"480p"}},
		{src: 360, names: []string{"360p"}}, // menor que 480p: um degrau na origem
		{src: 0, names: []string{"720p"}},   // desconhecido: um degrau seguro
	}
	for _, c := range cases {
		var got []string
		for _, r := range pickLadder(c.src) {
			got = append(got, r.name)
		}
		if !slices.Equal(got, c.names) {
			t.Errorf("pickLadder(%d) = %v, want %v", c.src, got, c.names)
		}
	}
}

// ---- buildHLSArgs ----

func TestBuildHLSArgs_WithAudio_MapsAudioPerRung(t *testing.T) {
	ladder := pickLadder(1080)
	args := buildHLSArgs("/in/raw.mp4", "/out", ladder, true)

	if got := countMap(args, "0:v:0"); got != 3 {
		t.Errorf("-map 0:v:0 x%d, want 3", got)
	}
	if got := countMap(args, "0:a:0"); got != 3 {
		t.Errorf("-map 0:a:0 x%d, want 3", got)
	}
	if !slices.Contains(args, "aac") {
		t.Error("faltou -c:a aac")
	}
	if vsm := varStreamMap(t, args); vsm != "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p" {
		t.Errorf("var_stream_map = %q", vsm)
	}
	if !slices.Contains(args, "veryfast") {
		t.Error("preset deveria ser veryfast (era 'fast', causa de transcode lento)")
	}
	// scale por rung preservando aspecto (bug antigo: -s WxH distorcia).
	if !slices.Contains(args, "scale=-2:1080") || !slices.Contains(args, "scale=-2:480") {
		t.Errorf("faltou filtro scale=-2:<h> por rung em %v", args)
	}
}

func TestBuildHLSArgs_NoAudio_ZeroAudioReferences(t *testing.T) {
	args := buildHLSArgs("/in/raw.mp4", "/out", pickLadder(720), false)

	if countMap(args, "0:a:0") != 0 {
		t.Error("ramo sem áudio não pode ter -map 0:a:0")
	}
	joined := strings.Join(args, " ")
	if slices.Contains(args, "-c:a") || strings.Contains(joined, "a:0,name") {
		t.Errorf("ramo sem áudio ainda referencia áudio: %s", joined)
	}
	if vsm := varStreamMap(t, args); vsm != "v:0,name:720p v:1,name:480p" {
		t.Errorf("var_stream_map = %q, want só vídeo, 2 rungs", vsm)
	}
}

func TestBuildHLSArgs_SmallSource_SingleRung(t *testing.T) {
	args := buildHLSArgs("/in/raw.mp4", "/out", pickLadder(360), true)
	if got := countMap(args, "0:v:0"); got != 1 {
		t.Errorf("origem 360p deveria gerar 1 rung, gerou %d", got)
	}
	if !slices.Contains(args, "scale=-2:360") {
		t.Errorf("faltou scale=-2:360 em %v", args)
	}
}

func TestBuildHLSArgs_CommonInvariants(t *testing.T) {
	for _, wa := range []bool{true, false} {
		args := buildHLSArgs("/in/raw.mp4", "/out/dir", pickLadder(1080), wa)
		for _, want := range []string{"-i", "/in/raw.mp4", "-f", "hls", "-progress", "pipe:1", "-master_pl_name", "master.m3u8"} {
			if !slices.Contains(args, want) {
				t.Errorf("withAudio=%v: falta %q", wa, want)
			}
		}
		if last := args[len(args)-1]; last != "/out/dir/%v.m3u8" {
			t.Errorf("withAudio=%v: último arg = %q", wa, last)
		}
	}
}

// ---- parseFFmpegProgress ----

func TestParseFFmpegProgress_MonotonicPercent(t *testing.T) {
	// 10s de vídeo; out_time_us em micros. Deve emitir só quando sobe.
	stream := strings.NewReader(strings.Join([]string{
		"frame=1", "out_time_us=0", "progress=continue",
		"out_time_us=2500000", "progress=continue", // 25%
		"out_time_us=2500000", "progress=continue", // repetido: não emite
		"out_time_us=9000000", "progress=continue", // 90%
		"out_time_us=10000000", "progress=end", // 100% -> clampa em 99
	}, "\n"))

	var got []int
	parseFFmpegProgress(stream, 10, func(p int) { got = append(got, p) })

	if !slices.Equal(got, []int{0, 25, 90, 99}) {
		t.Errorf("progressos = %v, want [0 25 90 99]", got)
	}
}

func TestParseFFmpegProgress_NoDurationJustDrains(t *testing.T) {
	stream := strings.NewReader("out_time_us=123\nprogress=end\n")
	called := false
	parseFFmpegProgress(stream, 0, func(int) { called = true })
	if called {
		t.Error("sem duração conhecida não deveria reportar progresso")
	}
}
