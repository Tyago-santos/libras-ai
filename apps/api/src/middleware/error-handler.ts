import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, isAppError } from "../lib/errors";

/**
 * Tratamento centralizado de erros (§3: logs estruturados + erros centrais).
 * Formato do corpo: { error: { code, message, details? } } (§8).
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
    // Erro de aplicação com código estável.
    if (isAppError(error)) {
      req.log.warn({ code: error.code, url: req.url }, "erro de aplicacao");
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    // Validação de schema do Fastify (JSON malformado, etc.).
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Payload inválido",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }

    const fastifyErr = error as FastifyError;
    if (fastifyErr.statusCode === 429) {
      return reply.code(429).send({
        error: { code: "RATE_LIMITED", message: "Muitas requisições — tente novamente" },
      });
    }
    if (fastifyErr.statusCode === 400) {
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "JSON inválido no corpo da requisição" },
      });
    }

    // Erro inesperado: loga com stack no servidor; nunca expõe stack ao cliente.
    req.log.error({ err: error, url: req.url }, "erro interno");
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
    });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: `Rota ${req.method} ${req.url} não encontrada` },
    }),
  );
}

export { AppError };
