package infrastructure

import (
	"fmt"

	maroto "github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/code"
	"github.com/johnfercher/maroto/v2/pkg/components/row"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/props"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
)

type CertificatePDFGenerator struct {
	BaseValidationURL string
}

func NewCertificatePDFGenerator(baseValidationURL string) *CertificatePDFGenerator {
	return &CertificatePDFGenerator{
		BaseValidationURL: baseValidationURL,
	}
}

func (g *CertificatePDFGenerator) GeneratePDF(cert *domain.Certificate) ([]byte, error) {
	cfg := config.NewBuilder().
		WithPageSize(pagesize.A4).
		WithOrientation(orientation.Horizontal).
		WithLeftMargin(20).
		WithTopMargin(20).
		WithRightMargin(20).
		Build()

	m := maroto.New(cfg)

	// Título do Certificado
	m.AddRows(
		row.New(20).Add(
			text.NewCol(12, "CERTIFICADO DE CAPACITAÇÃO OPERACIONAL", props.Text{
				Size:  22,
				Style: fontstyle.Bold,
				Align: align.Center,
			}),
		),
		row.New(10).Add(
			text.NewCol(12, "SOPHIIA — Sistema de Habilitação, Instrução e Inteligência Aplicada", props.Text{
				Size:  12,
				Style: fontstyle.Italic,
				Align: align.Center,
			}),
		),
		row.New(15), // Espaçador
	)

	// Texto de Concessão
	certText := fmt.Sprintf(
		"Certificamos que %s, inscrito(a) sob o documento nº %s, concluiu com êxito o treinamento '%s' (Versão %s), com carga horária total de %d horas.",
		cert.UserNameSnapshot,
		cert.UserDocumentSnapshot,
		cert.CourseTitleSnapshot,
		cert.VersionTagSnapshot,
		cert.WorkloadHoursSnapshot,
	)

	m.AddRows(
		row.New(30).Add(
			text.NewCol(12, certText, props.Text{
				Size:  14,
				Align: align.Center,
			}),
		),
		row.New(15),
	)

	// Rodapé com QR Code de Validação Pública e Token
	validationURL := fmt.Sprintf("%s/validar-certificado/%s", g.BaseValidationURL, cert.ValidationToken)
	issuedDateStr := cert.IssuedAt.Format("02/01/2006")

	m.AddRows(
		row.New(40).Add(
			text.NewCol(8, fmt.Sprintf("Data de Emissão: %s\nCódigo de Validação: %s\nStatus: %s\n\nConsulte a autenticidade apontando a câmera para o QR Code ao lado.", issuedDateStr, cert.ValidationToken, cert.Status), props.Text{
				Size:  10,
				Align: align.Left,
			}),
			code.NewQrCol(4, validationURL, props.Rect{
				Center: true,
			}),
		),
	)

	doc, err := m.Generate()
	if err != nil {
		return nil, fmt.Errorf("maroto pdf generation failed: %w", err)
	}

	return doc.GetBytes(), nil
}
