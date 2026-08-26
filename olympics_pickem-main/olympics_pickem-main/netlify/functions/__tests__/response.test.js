import { describe, it, expect } from 'vitest';
import { corsHeaders, jsonResponse, errorResponse } from '../utils/response.js';

describe('response utilities', () => {
  describe('corsHeaders', () => {
    it('returns CORS headers', () => {
      const headers = corsHeaders();

      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });
  });

  describe('jsonResponse', () => {
    it('returns 200 status by default', () => {
      const response = jsonResponse({ data: 'test' });

      expect(response.statusCode).toBe(200);
    });

    it('returns custom status code', () => {
      const response = jsonResponse({ data: 'test' }, 201);

      expect(response.statusCode).toBe(201);
    });

    it('sets Content-Type to application/json', () => {
      const response = jsonResponse({ data: 'test' });

      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('includes CORS headers', () => {
      const response = jsonResponse({ data: 'test' });

      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('stringifies body to JSON', () => {
      const data = { foo: 'bar', num: 42 };
      const response = jsonResponse(data);

      expect(response.body).toBe(JSON.stringify(data));
    });

    it('handles arrays', () => {
      const data = [1, 2, 3];
      const response = jsonResponse(data);

      expect(response.body).toBe('[1,2,3]');
    });

    it('handles nested objects', () => {
      const data = { nested: { deep: { value: true } } };
      const response = jsonResponse(data);

      expect(JSON.parse(response.body)).toEqual(data);
    });
  });

  describe('errorResponse', () => {
    it('returns 500 status by default', () => {
      const response = errorResponse('Something went wrong');

      expect(response.statusCode).toBe(500);
    });

    it('returns custom status code', () => {
      const response = errorResponse('Not found', 404);

      expect(response.statusCode).toBe(404);
    });

    it('wraps message in error object', () => {
      const response = errorResponse('Something went wrong');

      expect(JSON.parse(response.body)).toEqual({ error: 'Something went wrong' });
    });

    it('includes CORS headers', () => {
      const response = errorResponse('Error');

      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('sets Content-Type to application/json', () => {
      const response = errorResponse('Error');

      expect(response.headers['Content-Type']).toBe('application/json');
    });
  });
});
