import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Input from './Input';
import * as Download from '../Output/DownloadFiles';

// Mock file-saver so no real files are downloaded
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

// Mock the HTML and CSS generator functions
jest.spyOn(Download, 'generateHtmlFromFrame').mockReturnValue('<html></html>');
jest.spyOn(Download, 'generateCssFromFrame').mockReturnValue('/* css */');

// Fake data for Figma API responses
const mockFilePayload = {
  document: {
    id: 'ROOT',
    type: 'DOCUMENT',
    children: [{
      id: 'PAGE',
      type: 'CANVAS',
      children: [{
        id: 'FRAME_A',
        type: 'FRAME',
        name: 'Screen A',
        visible: true,
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: []
      }]
    }]
  }
};

const mockNodesPayload = {
  nodes: {
    FRAME_A: {
      document: {
        id: 'FRAME_A',
        type: 'FRAME',
        name: 'Screen A',
        visible: true,
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: []
      }
    }
  }
};

// Mock fetch to return fake Figma data for each request
beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const s = String(url);
    if (s.includes('/v1/files/') && !s.includes('/nodes')) {
      return Promise.resolve(new Response(JSON.stringify(mockFilePayload)));
    }
    if (s.includes('/v1/files/') && s.includes('/nodes')) {
      return Promise.resolve(new Response(JSON.stringify(mockNodesPayload)));
    }
    if (s.includes('/v1/images/')) {
      return Promise.resolve(new Response(JSON.stringify({ images: {} })));
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
  process.env.REACT_APP_FIGMA_TOKEN = 'test-token';
});

// Reset mocks after every test
afterEach(() => {
  jest.clearAllMocks();
});

// Test: input box and button should show up on screen
test('renders input and button', () => {
  render(<Input />);
  expect(screen.getByPlaceholderText(/Paste any Figma template link/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Download Files/i })).toBeInTheDocument();
});

// Test: shows alert if URL is not a valid Figma link
test('blocks invalid url', async () => {
  render(<Input />);
  const input = screen.getByPlaceholderText(/Paste any Figma template link/i);
  fireEvent.change(input, { target: { value: 'https://example.com/not-figma' } });
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button'));
  expect(window.alert).toHaveBeenCalledWith('Enter a valid Figma URL.');
});

// Test: runs HTML and CSS generators for a valid Figma link
test('calls generators and saves files for a valid figma url', async () => {
  render(<Input />);
  const input = screen.getByPlaceholderText(/Paste any Figma template link/i);

  // Use a sample valid Figma URL (must have 22 characters)
  fireEvent.change(input, {
    target: { value: 'https://www.figma.com/design/1234567890ABCDEFGHIJKL' }
  });

  fireEvent.click(screen.getByRole('button'));

  // Wait until the mock generator functions are called
  await waitFor(() => {
    expect(Download.generateHtmlFromFrame).toHaveBeenCalledTimes(1);
    expect(Download.generateCssFromFrame).toHaveBeenCalledTimes(1);
  });
});
