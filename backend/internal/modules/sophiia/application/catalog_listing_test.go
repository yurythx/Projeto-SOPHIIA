package application

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/uuid"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/infrastructure"
)

// TestCatalogListings cobre as duas consultas de listagem adicionadas para
// o Studio (ListAdminCourses) e o Portal (ListMyCourses): contagens de
// lições/vídeos, cálculo de progresso do usuário e os campos novos do
// outline (duração + markdown). Roda contra o Postgres real (pula sem
// TEST_DATABASE_URL / banco).
func TestCatalogListings(t *testing.T) {
	pool := getTestPool(t)
	repo := infrastructure.NewPostgresRepository(pool, nil)
	svc := NewService(repo, nil, &storageMock{}, nil, nil, slog.Default(), "test-bucket")
	ctx := context.Background()

	actor := uuid.New()
	student := uuid.New()
	other := uuid.New()
	ip := "127.0.0.1"

	// user_lesson_completion.user_id tem FK para users — os alunos
	// precisam existir de verdade.
	for _, id := range []uuid.UUID{student, other} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO users (id, username, email, display_name, active, password_hash, roles, created_at, updated_at)
			 VALUES ($1, $2, $2, 'Aluno de teste', true, 'x', '{sophiia-user}', now(), now())`,
			id, "aluno-"+id.String()[:8]); err != nil {
			t.Fatalf("inserir aluno de teste: %v", err)
		}
		uid := id
		t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, uid) })
	}

	sysName := "Sistema Listagem " + uuid.NewString()[:8]
	system, err := svc.CreateSystem(ctx, "LST-"+uuid.NewString()[:6], sysName, "")
	if err != nil {
		t.Fatalf("CreateSystem: %v", err)
	}
	course, err := svc.CreateCourse(ctx, system.ID, "Curso de Listagem", "Descrição do curso")
	if err != nil {
		t.Fatalf("CreateCourse: %v", err)
	}
	version, err := svc.CreateCourseVersion(ctx, course.ID, "1.0", 12)
	if err != nil {
		t.Fatalf("CreateCourseVersion: %v", err)
	}
	module, err := svc.CreateModule(ctx, version.ID, "Módulo 1", 0)
	if err != nil {
		t.Fatalf("CreateModule: %v", err)
	}
	l1, err := svc.CreateLesson(ctx, module.ID, "Aula 1", "# Introdução\nConteúdo em markdown.", true, 0)
	if err != nil {
		t.Fatalf("CreateLesson 1: %v", err)
	}
	if _, err := svc.CreateLesson(ctx, module.ID, "Aula 2", "", true, 1); err != nil {
		t.Fatalf("CreateLesson 2: %v", err)
	}

	// Aula 1 ganha um vídeo READY (90s); Aula 2 fica sem vídeo.
	ticket, err := svc.CreateLessonUploadURL(ctx, &actor, ip, l1.ID)
	if err != nil {
		t.Fatalf("CreateLessonUploadURL: %v", err)
	}
	if err := repo.UpdateVideoAssetResult(ctx, ticket.VideoAssetID, domain.VideoStatusReady, "hls/"+l1.ID.String()+"/master.m3u8", "", 90); err != nil {
		t.Fatalf("UpdateVideoAssetResult: %v", err)
	}

	if err := svc.PublishCourseVersion(ctx, &actor, ip, version.ID); err != nil {
		t.Fatalf("PublishCourseVersion: %v", err)
	}

	// O aluno conclui a Aula 1 (metade do curso).
	if _, err := svc.CompleteLesson(ctx, &student, ip, student, l1.ID); err != nil {
		t.Fatalf("CompleteLesson: %v", err)
	}

	// --- ListAdminCourses ---
	adminCourses, err := svc.ListAdminCourses(ctx)
	if err != nil {
		t.Fatalf("ListAdminCourses: %v", err)
	}
	ac := findAdmin(adminCourses, course.ID)
	if ac == nil {
		t.Fatal("curso não apareceu em ListAdminCourses")
	}
	if !ac.IsPublished || ac.VersionTag != "1.0" {
		t.Errorf("admin: IsPublished=%v VersionTag=%q, want true / 1.0", ac.IsPublished, ac.VersionTag)
	}
	if ac.LessonsCount != 2 || ac.VideosReadyCount != 1 {
		t.Errorf("admin: LessonsCount=%d VideosReadyCount=%d, want 2 / 1", ac.LessonsCount, ac.VideosReadyCount)
	}
	if ac.SystemName != sysName {
		t.Errorf("admin: SystemName=%q, want %q", ac.SystemName, sysName)
	}

	// --- ListMyCourses (progresso do aluno) ---
	myCourses, err := svc.ListMyCourses(ctx, student)
	if err != nil {
		t.Fatalf("ListMyCourses: %v", err)
	}
	mc := findMine(myCourses, course.ID)
	if mc == nil {
		t.Fatal("curso não apareceu em ListMyCourses")
	}
	if mc.TotalLessons != 2 || mc.CompletedLessons != 1 {
		t.Errorf("mine: %d/%d aulas, want 1/2", mc.CompletedLessons, mc.TotalLessons)
	}
	if mc.ProgressPercentage != 50 {
		t.Errorf("mine: progresso = %v%%, want 50", mc.ProgressPercentage)
	}
	if mc.WorkloadHours != 12 || mc.SystemName != sysName {
		t.Errorf("mine: WorkloadHours=%d SystemName=%q", mc.WorkloadHours, mc.SystemName)
	}
	if mc.IsCompleted {
		t.Error("mine: IsCompleted=true com só metade das aulas obrigatórias")
	}

	// Um OUTRO aluno vê o mesmo curso com 0% (progresso é por usuário).
	otherList, err := svc.ListMyCourses(ctx, other)
	if err != nil {
		t.Fatalf("ListMyCourses (outro): %v", err)
	}
	if oc := findMine(otherList, course.ID); oc == nil || oc.CompletedLessons != 0 || oc.ProgressPercentage != 0 {
		t.Errorf("outro aluno deveria ver 0%%, viu %+v", oc)
	}

	// --- outline: duração + markdown por lição ---
	outline, err := svc.GetCourseOutline(ctx, student, version.ID)
	if err != nil {
		t.Fatalf("GetCourseOutline: %v", err)
	}
	got := outline.Modules[0].Lessons[0]
	if got.DurationSeconds != 90 {
		t.Errorf("outline: DurationSeconds=%d, want 90", got.DurationSeconds)
	}
	if got.MarkdownContent == "" {
		t.Error("outline: MarkdownContent vazio, esperava o conteúdo da Aula 1")
	}
}

func findAdmin(list []domain.AdminCourseItem, id uuid.UUID) *domain.AdminCourseItem {
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}

func findMine(list []domain.MyCourseItem, id uuid.UUID) *domain.MyCourseItem {
	for i := range list {
		if list[i].CourseID == id {
			return &list[i]
		}
	}
	return nil
}
