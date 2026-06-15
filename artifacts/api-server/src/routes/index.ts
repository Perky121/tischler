import { Router, type IRouter } from "express";
import healthRouter from "./health";
import knowledgeRouter from "./knowledge";
import chatRouter from "./chat";
import rulesRouter from "./rules";
import transcribeRouter from "./transcribe";
import ttsRouter from "./tts";
import analyzeScreenRouter from "./analyze-screen";
import bridgeRouter from "./bridge";
import stolarRouter from "./stolar";
import nauciRouter from "./nauci";
import sumirajRouter from "./sumiraj";

const router: IRouter = Router();

router.use(healthRouter);
router.use(knowledgeRouter);
router.use(chatRouter);
router.use(rulesRouter);
router.use(transcribeRouter);
router.use(ttsRouter);
router.use(analyzeScreenRouter);
router.use(bridgeRouter);
router.use(stolarRouter);
router.use(nauciRouter);
router.use(sumirajRouter);

export default router;
