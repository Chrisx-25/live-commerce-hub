import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { sanitizeErrorMessage } from './utils/sanitizeError';
import authRoutes from './routes/auth';
import productsRoutes from './routes/products';
import anchorsRoutes from './routes/anchors';
import suppliersRoutes from './routes/suppliers';
import inventoryRoutes from './routes/inventory';
import purchasesRoutes from './routes/purchases';
import purchaseSuggestionsRoutes from './routes/purchaseSuggestions';
import liveSessionsRoutes from './routes/liveSessions';
import scriptsRoutes from './routes/scripts';
import dashboardRoutes from './routes/dashboard';
import ordersRoutes from './routes/orders';
import interactionsRoutes from './routes/interactions';
import selectionRoutes from './routes/selection';
import anchorPerformanceRoutes from './routes/anchorPerformance';
import afterSalesRoutes from './routes/afterSales';
import reportsRoutes from './routes/reports';
import interfaceLogsRoutes from './routes/interfaceLogs';
import liveReviewsRoutes from './routes/liveReviews';
import anchorProductPlanningRoutes from './routes/anchorProductPlanning';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auto-sanitize all error responses: intercept res.json to clean
// technical/SQL/stack-trace messages before they reach the client.
// This covers all ~76 route catch blocks without modifying any of them.
app.use((_req, res, next) => {
  const original = res.json.bind(res);
  res.json = function (body: any): express.Response {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (typeof body.message === 'string' && res.statusCode >= 400) {
        body = { ...body, message: sanitizeErrorMessage(body.message) };
      }
      if (typeof body.error === 'string' && res.statusCode >= 400) {
        body = { ...body, error: sanitizeErrorMessage(body.error) };
      }
    }
    return original(body);
  } as any;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/anchors', anchorsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/purchase-suggestions', purchaseSuggestionsRoutes);
app.use('/api/live-sessions', liveSessionsRoutes);
app.use('/api/scripts', scriptsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/selection', selectionRoutes);
app.use('/api/anchor-performance', anchorPerformanceRoutes);
app.use('/api/after-sales', afterSalesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/interface-logs', interfaceLogsRoutes);
app.use('/api/live-reviews', liveReviewsRoutes);
app.use('/api/anchor-product-planning', anchorProductPlanningRoutes);

app.use(errorHandler);

export default app;
