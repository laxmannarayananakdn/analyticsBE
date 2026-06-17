/**
 * FIS Currency Exchange Routes (Admin only)
 */

import express from 'express';
import {
  getAllFisCurrencyExchanges,
  getFisCurrencyExchangeById,
  getAvailableYears,
  createFisCurrencyExchange,
  updateFisCurrencyExchange,
} from '../services/FisCurrencyExchangeService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/years', async (_req, res) => {
  try {
    const years = await getAvailableYears();
    res.json({ years });
  } catch (error: unknown) {
    console.error('Get FIS currency exchange years error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const yearParam = req.query.year;
    const year =
      yearParam != null && String(yearParam).trim() !== ''
        ? parseInt(String(yearParam), 10)
        : undefined;
    if (yearParam != null && String(yearParam).trim() !== '' && isNaN(year!)) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    const rows = await getAllFisCurrencyExchanges(year);
    res.json(rows);
  } catch (error: unknown) {
    console.error('Get FIS currency exchanges error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const exchangeId = parseInt(req.params.id, 10);
    if (isNaN(exchangeId)) return res.status(400).json({ error: 'Invalid exchange ID' });
    const row = await getFisCurrencyExchangeById(exchangeId);
    if (!row) return res.status(404).json({ error: 'Currency exchange not found' });
    res.json(row);
  } catch (error: unknown) {
    console.error('Get FIS currency exchange error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const {
      fromCurrency,
      currencyName,
      entityCodes,
      exchangeRate,
      exchangeType,
      effectiveFrom,
      effectiveTo,
      year,
    } = req.body;
    if (
      !fromCurrency ||
      !currencyName ||
      exchangeRate == null ||
      !exchangeType ||
      !effectiveFrom ||
      year == null
    ) {
      return res.status(400).json({
        error:
          'fromCurrency, currencyName, exchangeRate, exchangeType, effectiveFrom, and year are required',
      });
    }
    const row = await createFisCurrencyExchange({
      fromCurrency,
      currencyName,
      entityCodes: Array.isArray(entityCodes) ? entityCodes : [],
      exchangeRate: Number(exchangeRate),
      exchangeType,
      effectiveFrom,
      effectiveTo: effectiveTo ?? null,
      year: Number(year),
      createdBy: req.user.email,
    });
    res.status(201).json(row);
  } catch (error: unknown) {
    console.error('Create FIS currency exchange error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (
      msg.includes('already exists') ||
      msg.includes('already mapped') ||
      msg.includes('not found') ||
      msg.includes('must be') ||
      msg.includes('cannot be') ||
      msg.includes('required')
    ) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const exchangeId = parseInt(req.params.id, 10);
    if (isNaN(exchangeId)) return res.status(400).json({ error: 'Invalid exchange ID' });

    const {
      currencyName,
      entityCodes,
      exchangeRate,
      exchangeType,
      effectiveFrom,
      effectiveTo,
      year,
    } = req.body;
    const row = await updateFisCurrencyExchange(exchangeId, {
      currencyName,
      entityCodes: Array.isArray(entityCodes) ? entityCodes : undefined,
      exchangeRate: exchangeRate != null ? Number(exchangeRate) : undefined,
      exchangeType,
      effectiveFrom,
      effectiveTo,
      year: year != null ? Number(year) : undefined,
      updatedBy: req.user.email,
    });
    res.json(row);
  } catch (error: unknown) {
    console.error('Update FIS currency exchange error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (msg === 'Currency exchange not found') return res.status(404).json({ error: msg });
    if (
      msg.includes('already exists') ||
      msg.includes('already mapped') ||
      msg.includes('not found') ||
      msg.includes('must be') ||
      msg.includes('required')
    ) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

export default router;
