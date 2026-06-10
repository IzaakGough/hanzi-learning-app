import cors from "cors";
import express from "express";
import { HEALTHCHECK_PATH, type HealthcheckResponse } from "@hanzi-learning-app/shared";

const port = Number(process.env.PORT ?? 3001);
const app = express();

app.use(cors());
app.use(express.json());

app.get(HEALTHCHECK_PATH, (_request, response) => {
  const payload: HealthcheckResponse = {
    status: "ok",
    service: "api"
  };

  response.json(payload);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
