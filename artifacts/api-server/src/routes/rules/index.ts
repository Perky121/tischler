import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { SaveRulesBody } from "@workspace/api-zod";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const rulesPath = path.join(dataDir, "stipe_rules.txt");

fs.mkdirSync(dataDir, { recursive: true });

router.get("/rules", (_req, res): void => {
  let content = "";
  try {
    if (fs.existsSync(rulesPath)) {
      content = fs.readFileSync(rulesPath, "utf-8");
    }
  } catch {
    content = "";
  }
  res.json({ content });
});

router.post("/rules", (req, res): void => {
  const parsed = SaveRulesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(rulesPath, parsed.data.content, "utf-8");
    res.json({ content: parsed.data.content });
  } catch {
    res.status(500).json({ error: "Failed to save rules" });
  }
});

export default router;
