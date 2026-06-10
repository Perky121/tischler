import { Router, type IRouter } from "express";
import healthRouter from "./health";
import knowledgeRouter from "./knowledge";
import chatRouter from "./chat";
import rulesRouter from "./rules";

const router: IRouter = Router();

router.use(healthRouter);
router.use(knowledgeRouter);
router.use(chatRouter);
router.use(rulesRouter);

export default router;
