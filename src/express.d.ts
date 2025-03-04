// express.d.ts
import "express";

declare global {
  namespace Express {
    interface Response {
      jsend: {
        success: (data: any, message?: string, statusCode?: number) => void;
        fail: (message: string, data: any, errorCode?: number | null, statusCode?: number) => void;
        error: (message: string, statusCode?: number, errorCode?: number | null, data?: any) => void;
      };
    }
  }
}