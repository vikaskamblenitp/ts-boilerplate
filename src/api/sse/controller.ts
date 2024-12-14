import { Request, Response } from "express";
import { sse } from "./sse.js";
import { catchAsync } from "#utils/index.js";

export const controller = {
  setupSSE: catchAsync(async (req: Request, res: Response) => {
    const response = await sse.addClient(req);
    return res.status(200).json(response);
  })
}