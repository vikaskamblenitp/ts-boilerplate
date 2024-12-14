import { Router } from "express";
import { controller as api } from "./controller.js";

const router = Router();

router.post("/sse", api.setupSSE);

export default router;