import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function customErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    // Default error response
    let status = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    let success = false;

    // error messages matching to sheet.ts schemas
    if (status === 400) {
        // Bad Request (e.g., invalid input, missing fields)
        message = message || 'Invalid input';
    } else if (status === 403) {
        // Forbidden (e.g., permission denied)
        message = message || 'Permission denied';
    } else if (status === 404) {
        // Not Found (e.g., sheet not found)
        message = message || 'Sheet not found';
    }

    reply.status(status).send({
        message,
        success
    });
}