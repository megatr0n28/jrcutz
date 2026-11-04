package main

import (
	"fmt"
	"net/smtp"
	"os"
	"strings"
)

type smtpConfig struct {
	host     string
	port     string
	username string
	password string
	from     string
	to       string
	fromName string
}

func loadSMTPConfig() (smtpConfig, bool) {
	cfg := smtpConfig{
		host:     strings.TrimSpace(os.Getenv("SMTP_HOST")),
		port:     strings.TrimSpace(os.Getenv("SMTP_PORT")),
		username: strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
		password: strings.TrimSpace(os.Getenv("SMTP_APP_PASSWORD")),
		from:     strings.TrimSpace(os.Getenv("MAIL_FROM")),
		to:       strings.TrimSpace(os.Getenv("BARBER_EMAIL")),
		fromName: strings.TrimSpace(os.Getenv("MAIL_FROM_NAME")),
	}
	if cfg.host == "" || cfg.port == "" || cfg.username == "" ||
		cfg.password == "" || cfg.from == "" || cfg.to == "" {
		return smtpConfig{}, false
	}
	return cfg, true
}

func sendAppointmentEmail(cfg smtpConfig, subject, body string) error {
	fromHeader := cfg.from
	if cfg.fromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", cfg.fromName, cfg.from)
	}
	message := strings.Join([]string{
		"From: " + fromHeader,
		"To: " + cfg.to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	auth := smtp.PlainAuth("", cfg.username, cfg.password, cfg.host)
	return smtp.SendMail(cfg.host+":"+cfg.port, auth, cfg.from,
		[]string{cfg.to}, []byte(message))
}
