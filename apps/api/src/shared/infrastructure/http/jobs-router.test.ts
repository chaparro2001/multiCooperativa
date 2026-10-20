import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app';
import { createJobsRouter, tokensMatch } from './jobs-router';

const TOKEN = 'j'.repeat(40);

function setup() {
  const dueDates = vi.fn(async () => ({ overdue: 2, dueSoon: 1 }));
  const app = createApp({ routers: [createJobsRouter({ token: TOKEN, dueDates })] });
  return { app, dueDates };
}

describe('POST /jobs/due-dates (US-INV-07, NFR-INV-04)', () => {
  it('runs the job with the right bearer token and returns its counts', async () => {
    const { app, dueDates } = setup();

    const response = await request(app)
      .post('/jobs/due-dates')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ overdue: 2, dueSoon: 1 });
    expect(dueDates).toHaveBeenCalledOnce();
  });

  it.each([
    ['no header', undefined],
    ['wrong token', 'Bearer nope'],
    ['same prefix, shorter', `Bearer ${TOKEN.slice(0, -1)}`],
    ['wrong scheme', `Basic ${TOKEN}`],
    ['empty bearer', 'Bearer '],
  ])('answers 401 and does not run the job: %s', async (_name, header) => {
    const { app, dueDates } = setup();
    const call = request(app).post('/jobs/due-dates');

    const response = await (header ? call.set('Authorization', header) : call);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthenticated' });
    expect(dueDates).not.toHaveBeenCalled();
  });

  it('is POST only', async () => {
    const { app } = setup();

    const response = await request(app)
      .get('/jobs/due-dates')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(404);
  });

  it('is not mounted without a router (no JOBS_TOKEN configured)', async () => {
    const response = await request(createApp()).post('/jobs/due-dates');

    expect(response.status).toBe(404);
  });

  it('compares tokens of different length without throwing', () => {
    expect(tokensMatch('a', 'abc')).toBe(false);
    expect(tokensMatch('abc', 'abc')).toBe(true);
  });
});
