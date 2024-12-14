import { Router } from "express";
import sseRouter from "./sse/routes.js";

const router = Router();

router.use(sseRouter);

export default router;