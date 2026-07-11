import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a route handler body so thrown ApiError/ZodError become clean JSON responses. */
export function withErrorHandling(
  handler: (request: Request, context: unknown) => Promise<NextResponse>,
) {
  return async (request: Request, context: unknown) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: "invalid request body", issues: error.issues },
          { status: 400 },
        );
      }
      console.error(error);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  };
}
