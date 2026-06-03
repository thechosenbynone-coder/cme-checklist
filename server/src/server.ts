import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'cme-checklist-api' });
});

app.listen(PORT, () => {
  console.log(`\u2705 Server running on port ${PORT}`);
});