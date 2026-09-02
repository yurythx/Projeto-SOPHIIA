package domain

import "fmt"

// TrainingCompletionPolicy define as regras puras de domínio para aprovação e conclusão
// de um curso/versão pelo servidor público (§ SOPHIIA).
type TrainingCompletionPolicy struct {
	MinPercentageRequired float64
}

// NewTrainingCompletionPolicy cria a política com o padrão mínimo de 90%.
func NewTrainingCompletionPolicy() *TrainingCompletionPolicy {
	return &TrainingCompletionPolicy{
		MinPercentageRequired: 90.0,
	}
}

// CalculateProgress calcula a porcentagem e determina se a versão do curso foi concluída.
func (p *TrainingCompletionPolicy) CalculateProgress(completedCount, totalMandatoryCount int) (float64, bool, error) {
	if totalMandatoryCount <= 0 {
		return 0.0, false, fmt.Errorf("total de lições obrigatórias deve ser maior que zero")
	}
	if completedCount < 0 {
		completedCount = 0
	}
	if completedCount > totalMandatoryCount {
		completedCount = totalMandatoryCount
	}

	percentage := (float64(completedCount) / float64(totalMandatoryCount)) * 100.0
	isCompleted := percentage >= p.MinPercentageRequired

	return percentage, isCompleted, nil
}
