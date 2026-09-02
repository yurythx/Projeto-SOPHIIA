import { NextRequest, NextResponse } from "next/server";

import { BACKEND_INTERNAL_URL as BACKEND_URL } from "@/lib/api/backendUrl";

// Proxy BFF público: encaminha SOMENTE os endpoints /api/v1/public/** da
// API Go, SEM exigir sessão. É o caminho usado pela validação pública de
// certificado SOPHIIA (/validar-certificado/:token), acessível a qualquer
// visitante — o proxy autenticado em app/api/backend/[...path]/route.ts
// devolveria 401 aqui.
//
// A all/list está fixa no prefixo /api/v1/public/ — nada fora dele pode
// ser alcançado por esta rota, mesmo que o path recebido tente escapar.
async function proxyPublic(req: NextRequest, path: string[]): Promise<NextResponse> {
  const segments = path
    .filter(
      (s) =>
        s.length > 0 &&
        s !== "api" &&
        s !== "backend" &&
        s !== "public" &&
        s !== "v1" &&
        s !== "..",
    )
    .map(encodeURIComponent);

  const targetUrl = new URL(`/api/v1/public/${segments.join("/")}`, BACKEND_URL);
  targetUrl.search = req.nextUrl.search;

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: "GET",
      headers: { "X-Request-ID": requestId, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        data: null,
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "a API está indisponível no momento" },
      },
      { status: 503 },
    );
  }

  const body = await backendResponse.text();
  return new NextResponse(body, {
    status: backendResponse.status,
    headers: {
      "Content-Type": backendResponse.headers.get("content-type") ?? "application/json",
      "X-Request-ID": requestId,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyPublic(req, path);
}
