import { Loader2 } from "lucide-react";

export default function PortalLoading() {
  return (
    <div className="flex h-[50vh] w-full flex-col items-center justify-center space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm font-medium text-muted">Carregando portal e catálogo de cursos...</p>
    </div>
  );
}
