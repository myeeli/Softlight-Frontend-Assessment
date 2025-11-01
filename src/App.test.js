import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the in the download files button', () => {
  render(<App />);
  const linkElement = screen.getByText(/Download Files/i);
  expect(linkElement).toBeInTheDocument();
});
