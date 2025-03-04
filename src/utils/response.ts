import { type NextFunction, type Request, type Response } from "express";

export const jsend = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.jsend = {
      success: (data: any, message = "Successful", statusCode = 200) => {
        res.status(statusCode).send({
          status: "success",
          message,
          data,
        });
      },
      fail: (message: string, data: any, errorCode: number | null = null, statusCode = 400) => {
        res.status(statusCode).send({
          status: "fail",
          message,
          errorCode,
          data,
        });
      },
      error: (message: string, statusCode = 500, errorCode: number | null = null, data: any = null) => {
        res.status(statusCode).send({
          status: "error",
          message,
          errorCode,
          data,
        });
      },
    };
    next();
  };
};