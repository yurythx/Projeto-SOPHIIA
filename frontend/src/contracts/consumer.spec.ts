import { PactV3, MatchersV3 } from "@pact-foundation/pact";
import path from "path";
import { describe, it, expect } from "vitest";

const { like, eachLike, string, uuid } = MatchersV3;

const provider = new PactV3({
  consumer: "sophiia-frontend",
  provider: "sophiia-backend",
  dir: path.resolve(process.cwd(), "pacts"),
});

describe("SOPHIIA Systems API Contract", () => {
  it("returns a list of systems", async () => {
    provider
      .uponReceiving("a request for systems")
      .withRequest({
        method: "GET",
        path: "/api/v1/sophiia/portal/catalog/systems",
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: like({
          data: eachLike({
            id: uuid("123e4567-e89b-12d3-a456-426614174000"),
            name: string("Sistema de RH"),
            description: string("Treinamento de RH"),
            created_at: string("2026-01-01T00:00:00Z"),
          }),
        }),
      });

    await provider.executeTest(async (mockserver) => {
      const res = await fetch(`${mockserver.url}/api/v1/sophiia/portal/catalog/systems`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.data[0]).toHaveProperty("id");
      expect(data.data[0]).toHaveProperty("name");
    });
  });
});
