package transport

// heartbeatRequest é o corpo de POST /sophiia/portal/progress/heartbeat.
type heartbeatRequest struct {
	CourseVersionID string `json:"course_version_id" validate:"required,uuid"`
	LessonID        string `json:"lesson_id" validate:"required,uuid"`
	PositionSeconds int    `json:"position_seconds" validate:"gte=0"`
}
