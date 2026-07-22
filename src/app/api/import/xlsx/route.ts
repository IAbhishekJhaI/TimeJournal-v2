import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ApiError, withErrorHandling } from "@/lib/api/errors";
import { RATE_LIMITS, checkRateLimit } from "@/lib/api/rate-limit";
import { ImportValidationError, importWorkbook } from "@/lib/import/run";

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  checkRateLimit(`import:xlsx:${user.id}`, RATE_LIMITS.import);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ApiError(400, "expected a multipart/form-data 'file' field");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importWorkbook(user.id, buffer);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportValidationError) {
      throw new ApiError(400, error.message);
    }
    throw error;
  }
});
