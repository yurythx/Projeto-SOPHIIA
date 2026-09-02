package infrastructure

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/yurythx/projeto-sophiia/internal/platform/storage"
)

// contentTypeByExt mapeia as extensões que a pipeline HLS produz para o
// Content-Type correto — o player (hls.js) e alguns proxies dependem disso
// para tratar o master/playlist como texto e os segmentos como binário.
var contentTypeByExt = map[string]string{
	".m3u8": "application/vnd.apple.mpegurl",
	".ts":   "video/mp2t",
	".mp4":  "video/mp4",
	".m4s":  "video/iso.segment",
	".vtt":  "text/vtt",
}

// DownloadToFile copia um objeto do storage para um arquivo local, usado
// pelo worker de vídeo para materializar o MP4 bruto antes do FFmpeg (que
// precisa de um caminho de arquivo, não de um stream).
func DownloadToFile(ctx context.Context, provider storage.Provider, bucket, objectKey, destPath string) error {
	reader, err := provider.Get(ctx, bucket, objectKey)
	if err != nil {
		return fmt.Errorf("download %s: %w", objectKey, err)
	}
	defer reader.Close()

	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, reader); err != nil {
		return fmt.Errorf("write temp file: %w", err)
	}
	return nil
}

// UploadDir envia recursivamente todo arquivo de localDir para
// <keyPrefix>/<caminho relativo> no bucket. Retorna o número de arquivos
// enviados. Usado para publicar os segmentos e playlists HLS em hls/.
func UploadDir(ctx context.Context, provider storage.Provider, bucket, localDir, keyPrefix string) (int, error) {
	count := 0
	err := filepath.WalkDir(localDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(localDir, path)
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()

		ct := contentTypeByExt[strings.ToLower(filepath.Ext(path))]
		if ct == "" {
			ct = "application/octet-stream"
		}
		key := keyPrefix + "/" + filepath.ToSlash(rel)
		if err := provider.Put(ctx, bucket, key, f, info.Size(), ct); err != nil {
			return fmt.Errorf("upload %s: %w", key, err)
		}
		count++
		return nil
	})
	return count, err
}
