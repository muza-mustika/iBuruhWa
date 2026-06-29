import { Router } from "express";
import healthRouter from "./health";
import { sessionsRouter } from "./sessions";
import { rulesRouter } from "./rules";
import { messagesRouter } from "./messages";
import { sendRouter } from "./send";
import { statsRouter } from "./stats";
import { settingsRouter } from "./settings";
import { setupRouter } from "./setup";
import { eventsRouter } from "./events";
import groupReplySessionsRouter from "./group-reply-sessions";
import ruleGroupsRouter from "./rule-groups";

const router = Router();

router.use("/healthz", healthRouter);
router.use("/sessions", sessionsRouter);
router.use("/rules", rulesRouter);
router.use("/messages", messagesRouter);
router.use("/send", sendRouter);
router.use("/stats", statsRouter);
router.use("/settings", settingsRouter);
router.use("/setup", setupRouter);
router.use("/events", eventsRouter);
router.use("/group-reply-sessions", groupReplySessionsRouter);
router.use("/rule-groups", ruleGroupsRouter);

export default router;
