import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { createKundli, getKundli } from '../controllers/kundli.controller.js';

export const kundliRouter = Router();

// POST /api/v1/kundli — per spec §54
kundliRouter.post('/', rateLimit, createKundli);

// GET /api/v1/kundli/:id — per spec §55
kundliRouter.get('/:id', getKundli);
