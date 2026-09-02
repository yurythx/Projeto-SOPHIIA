package transport

import (
	"strings"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
)

// publicCertificateView é o ÚNICO formato devolvido pela validação pública
// de certificado (rota SEM autenticação — internal/app/router.go, grupo
// /api/v1/public). Achado de auditoria (revisão pedida pelo usuário): o
// handler serializava a entidade domain.Certificate crua, o que expunha a
// QUALQUER pessoa de posse do token — que trafega em QR Code impresso,
// e-mail e histórico de navegador — o CPF completo do titular
// (user_document_snapshot) além de identificadores internos (user_id,
// course_version_id) e o caminho do objeto no storage (pdf_storage_path).
// Para uma plataforma da administração pública isso é tratamento de dado
// pessoal além do necessário (LGPD art. 6º). Esta view devolve só o
// suficiente para conferir a autenticidade do documento: quem valida já
// tem o certificado físico em mãos para comparar nome e curso.
type publicCertificateView struct {
	ValidationToken string `json:"validation_token"`
	HolderName      string `json:"holder_name"`
	HolderDocument  string `json:"holder_document"` // sempre mascarado: ***.***.***-01
	CourseTitle     string `json:"course_title"`
	VersionTag      string `json:"version_tag"`
	WorkloadHours   int    `json:"workload_hours"`
	IssuedAt        string `json:"issued_at"` // YYYY-MM-DD
	Status          string `json:"status"`    // "valid" | "revoked"
	IsValid         bool   `json:"is_valid"`
}

func toPublicCertificateView(c *domain.Certificate) publicCertificateView {
	return publicCertificateView{
		ValidationToken: c.ValidationToken,
		HolderName:      c.UserNameSnapshot,
		HolderDocument:  maskDocument(c.UserDocumentSnapshot),
		CourseTitle:     c.CourseTitleSnapshot,
		VersionTag:      c.VersionTagSnapshot,
		WorkloadHours:   c.WorkloadHoursSnapshot,
		IssuedAt:        c.IssuedAt.Format("2006-01-02"),
		Status:          strings.ToLower(string(c.Status)),
		IsValid:         c.Status == domain.CertificateStatusValid && c.RevokedAt == nil,
	}
}

// maskDocument mantém só os dois últimos dígitos visíveis — o bastante
// para o titular reconhecer o próprio documento, insuficiente para um
// terceiro reconstruí-lo. Preserva a forma de CPF (11 dígitos) quando
// reconhece; caso contrário devolve um mascaramento genérico.
func maskDocument(doc string) string {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, doc)
	if len(digits) < 3 {
		return "***"
	}
	last := digits[len(digits)-2:]
	if len(digits) == 11 { // CPF
		return "***.***.***-" + last
	}
	return "****" + last
}
