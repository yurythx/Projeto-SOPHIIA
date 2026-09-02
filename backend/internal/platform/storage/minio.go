package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/minio/minio-go/v7/pkg/lifecycle"
)

// MinioProvider implementa a interface Provider para interagir com o MinIO (ou AWS S3).
type MinioProvider struct {
	client        *minio.Client // ops server-side (rede interna)
	presignClient *minio.Client // assina URLs para o host alcançável pelo navegador
}

// NewMinioProvider constrói o cliente do servidor MinIO. As URLs
// pré-assinadas são assinadas para o MESMO host — use
// NewMinioProviderWithPresign quando o navegador acessa o MinIO por outro
// endereço (o caso do Docker: backend fala com "minio:9000", navegador com
// "localhost:9000").
func NewMinioProvider(endpoint, accessKey, secretKey string, useSSL bool) (*MinioProvider, error) {
	return NewMinioProviderWithPresign(endpoint, endpoint, accessKey, secretKey, useSSL, useSSL)
}

// minioRegion fixa a região usada na assinatura V4. O MinIO responde como
// "us-east-1" por padrão. Passar Region explicitamente é essencial no
// presignClient: sem ela, o minio-go dispara um GetBucketLocation ao vivo
// contra o publicEndpoint na hora de assinar a URL — e esse host
// (ex.: localhost:9000) não é alcançável de DENTRO do container, então a
// assinatura falhava com "connection refused". Com a região conhecida o
// minio-go assina offline, sem nenhuma chamada de rede.
const minioRegion = "us-east-1"

// NewMinioProviderWithPresign separa o endpoint interno (Get/Put/Delete) do
// endpoint público usado só para PresignedPutURL/PresignedGetURL.
func NewMinioProviderWithPresign(endpoint, publicEndpoint, accessKey, secretKey string, useSSL, publicUseSSL bool) (*MinioProvider, error) {
	creds := credentials.NewStaticV4(accessKey, secretKey, "")
	client, err := minio.New(endpoint, &minio.Options{Creds: creds, Secure: useSSL, Region: minioRegion})
	if err != nil {
		return nil, fmt.Errorf("storage: failed to initialize minio client: %w", err)
	}
	presignClient := client
	if publicEndpoint != "" && publicEndpoint != endpoint {
		presignClient, err = minio.New(publicEndpoint, &minio.Options{Creds: creds, Secure: publicUseSSL, Region: minioRegion})
		if err != nil {
			return nil, fmt.Errorf("storage: failed to initialize minio presign client: %w", err)
		}
	}
	return &MinioProvider{client: client, presignClient: presignClient}, nil
}

// EnsureBucket verifica se um bucket existe e cria caso não exista.
func (p *MinioProvider) EnsureBucket(ctx context.Context, bucketName string) error {
	exists, err := p.client.BucketExists(ctx, bucketName)
	if err != nil {
		return fmt.Errorf("storage: check bucket exists: %w", err)
	}
	if !exists {
		err = p.client.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("storage: create bucket: %w", err)
		}
	}
	return nil
}

// EnsureRawUploadsLifecycle aplica (idempotente) uma regra ILM que expira
// os objetos sob o prefixo raw-uploads/ após expireDays dias. É o
// "auto-delete" do MP4 original citado na arquitetura: uma vez
// transcodificado para HLS (prefixo hls/, permanente), o arquivo bruto
// vira lixo e não deve acumular custo de armazenamento.
//
// A regra é reescrita por completo a cada chamada (mesmo ID) — não
// acumula duplicatas entre reinícios. Um MinIO/S3 que não suporte ILM
// devolve erro, que o chamador trata como aviso (não-fatal).
func (p *MinioProvider) EnsureRawUploadsLifecycle(ctx context.Context, bucketName string, expireDays int) error {
	cfg := lifecycle.NewConfiguration()
	cfg.Rules = []lifecycle.Rule{
		{
			ID:         "sophiia-raw-uploads-expire",
			Status:     "Enabled",
			RuleFilter: lifecycle.Filter{Prefix: "raw-uploads/"},
			Expiration: lifecycle.Expiration{Days: lifecycle.ExpirationDays(expireDays)},
		},
	}
	if err := p.client.SetBucketLifecycle(ctx, bucketName, cfg); err != nil {
		return fmt.Errorf("storage: set raw-uploads lifecycle: %w", err)
	}
	return nil
}

// EnsureHLSPublicRead libera GET anônimo apenas para o prefixo hls/ do
// bucket — os segmentos e playlists HLS precisam ser buscáveis
// diretamente pelo player no navegador (hls.js faz dezenas de requests
// por vídeo; pré-assinar cada um é inviável). raw-uploads/,
// certificates/ e attachments/ continuam privados.
//
// Idempotente: sobrescreve a policy inteira a cada chamada. Um backend S3
// que rejeite policy anônima devolve erro, tratado como aviso pelo
// chamador.
func (p *MinioProvider) EnsureHLSPublicRead(ctx context.Context, bucketName string) error {
	policy := fmt.Sprintf(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"AWS": ["*"]},
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::%s/hls/*"]
    }
  ]
}`, bucketName)
	if err := p.client.SetBucketPolicy(ctx, bucketName, policy); err != nil {
		return fmt.Errorf("storage: set hls public-read policy: %w", err)
	}
	return nil
}

// Put salva um objeto (arquivo) no bucket.
func (p *MinioProvider) Put(ctx context.Context, bucketName, objectName string, reader io.Reader, objectSize int64, contentType string) error {
	_, err := p.client.PutObject(ctx, bucketName, objectName, reader, objectSize, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("storage: put object: %w", err)
	}
	return nil
}

// Get retorna um leitor para um objeto.
func (p *MinioProvider) Get(ctx context.Context, bucketName, objectName string) (io.ReadCloser, error) {
	obj, err := p.client.GetObject(ctx, bucketName, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("storage: get object: %w", err)
	}
	return obj, nil
}

// Delete remove um objeto do bucket.
func (p *MinioProvider) Delete(ctx context.Context, bucketName, objectName string) error {
	err := p.client.RemoveObject(ctx, bucketName, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("storage: delete object: %w", err)
	}
	return nil
}

// PresignedPutURL gera uma URL segura temporária para que o cliente consiga fazer o upload via PUT sem passar pelo backend.
func (p *MinioProvider) PresignedPutURL(ctx context.Context, bucketName, objectName string, expiry time.Duration) (string, error) {
	url, err := p.presignClient.PresignedPutObject(ctx, bucketName, objectName, expiry)
	if err != nil {
		return "", fmt.Errorf("storage: generate presigned put: %w", err)
	}
	return url.String(), nil
}

// PresignedGetURL gera uma URL temporária para leitura.
func (p *MinioProvider) PresignedGetURL(ctx context.Context, bucketName, objectName string, expiry time.Duration) (string, error) {
	url, err := p.presignClient.PresignedGetObject(ctx, bucketName, objectName, expiry, nil)
	if err != nil {
		return "", fmt.Errorf("storage: generate presigned get: %w", err)
	}
	return url.String(), nil
}
