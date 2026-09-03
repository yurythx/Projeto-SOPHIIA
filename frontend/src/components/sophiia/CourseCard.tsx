"use client";

import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";

import { CourseCover } from "@/components/sophiia/CourseCover";
import type { MyCourseItem } from "@/lib/api/sophiia";

export function CourseCard({ course }: { course: MyCourseItem }) {
  const pct = Math.round(course.progress_percentage);

  return (
    <Link
      href={`/portal/curso/${course.version_id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-surface-border bg-surface transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <CourseCover id={course.course_id} systemName={course.system_name} className="aspect-video w-full">
        {course.is_completed && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-success-strong">
            <CheckCircle2 className="h-3 w-3" /> Concluído
          </span>
        )}
      </CourseCover>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
          {course.title}
        </h3>
        <p className="truncate text-xs text-muted">{course.system_name}</p>

        <div className="mt-auto space-y-1.5 pt-2">
          <div
            role="progressbar"
            aria-label={`${pct}% concluído`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border/60"
          >
            <div
              className={`h-full rounded-full transition-all ${
                course.is_completed ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>
              {pct}% concluído
              {course.total_lessons > 0
                ? ` · ${course.completed_lessons}/${course.total_lessons} aulas`
                : ""}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {course.workload_hours}h
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
