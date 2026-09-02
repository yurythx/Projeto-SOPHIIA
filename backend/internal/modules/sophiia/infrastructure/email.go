package infrastructure

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

// EmailMessage é uma mensagem de e-mail simples em texto puro.
type EmailMessage struct {
	To      string
	Subject string
	Body    string
}

// EmailSender abstrai o envio de e-mail institucional (worker de
// notificação). Uma implementação real (SMTP) e um fallback de log.
type EmailSender interface {
	Send(ctx context.Context, msg EmailMessage) error
}

// SMTPSender envia via SMTP com STARTTLS (o net/smtp negocia STARTTLS
// automaticamente quando o servidor anuncia suporte e um auth é
// fornecido). Sem usuário configurado, envia sem autenticação (relay
// interno).
type SMTPSender struct {
	Addr     string // host:porta
	From     string
	Username string
	Password string
	Host     string // só o host, para o PlainAuth
}

func NewSMTPSender(host string, port int, username, password, from string) *SMTPSender {
	return &SMTPSender{
		Addr:     fmt.Sprintf("%s:%d", host, port),
		From:     from,
		Username: username,
		Password: password,
		Host:     host,
	}
}

func (s *SMTPSender) Send(_ context.Context, msg EmailMessage) error {
	var auth smtp.Auth
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	payload := buildRFC822(s.From, msg)
	if err := smtp.SendMail(s.Addr, auth, s.From, []string{msg.To}, payload); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	return nil
}

// LogEmailSender apenas registra a mensagem — usado quando o SMTP não está
// configurado, para o fluxo funcionar em dev/teste sem um servidor de
// e-mail real.
type LogEmailSender struct{ Logger *slog.Logger }

func (l *LogEmailSender) Send(_ context.Context, msg EmailMessage) error {
	l.Logger.Info("sophiia notify: e-mail (SMTP não configurado, apenas log)",
		slog.String("to", msg.To), slog.String("subject", msg.Subject), slog.String("body", msg.Body))
	return nil
}

func buildRFC822(from string, msg EmailMessage) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", msg.To)
	fmt.Fprintf(&b, "Subject: %s\r\n", msg.Subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(msg.Body)
	b.WriteString("\r\n")
	return []byte(b.String())
}
