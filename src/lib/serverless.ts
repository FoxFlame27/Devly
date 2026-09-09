/** True on hosts that can't keep processes alive between requests (Vercel, AWS Lambda). */
export function isServerless(): boolean {
  return !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}
