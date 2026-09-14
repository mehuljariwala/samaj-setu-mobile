import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { createMatch, getMatch } from '../controllers/match.controller.js';

export const matchRouter = Router();

// POST /api/v1/match — per spec §56
matchRouter.post('/', rateLimit, createMatch);

// GET /api/v1/match/:id — per spec §57
matchRouter.get('/:id', getMatch);
