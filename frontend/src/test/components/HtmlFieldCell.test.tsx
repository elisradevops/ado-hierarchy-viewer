import { vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { HtmlFieldCell } from '../../components/HtmlFieldCell';

function renderCell(rawValue: string, label = 'Description') {
  render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <HtmlFieldCell label={label} rawValue={rawValue} />
    </ThemeProvider>
  );
}

describe('HtmlFieldCell', () => {
  it('renders a stripped-text preview, not raw HTML', () => {
    renderCell('<p dir="auto" style="margin-top:0">Fixes login timeout</p>');
    expect(screen.getByText('Fixes login timeout')).toBeInTheDocument();
    expect(screen.queryByText(/<p/)).not.toBeInTheDocument();
  });

  it('dialog is closed by default and opens on click, showing the label as title', async () => {
    renderCell('<p>First paragraph</p><p>Second paragraph</p>', 'Description');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('First paragraph Second paragraph'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('dialog renders sanitized rich HTML structure, not flattened plain text', async () => {
    renderCell('<p><strong>Root cause</strong>: session expiry</p><ul><li>Fix A</li><li>Fix B</li></ul>');
    await userEvent.click(screen.getByText('Root cause: session expiry Fix A Fix B'));

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('strong')).not.toBeNull();
    expect(dialog.querySelector('ul')).not.toBeNull();
    expect(dialog.querySelectorAll('li')).toHaveLength(2);
  });

  it('dialog HTML has no surviving style/class/dir attributes', async () => {
    renderCell('<p dir="auto" style="color:red" class="foo">Styled text</p>');
    await userEvent.click(screen.getByText('Styled text'));

    const dialog = screen.getByRole('dialog');
    const p = dialog.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.getAttribute('style')).toBeNull();
    expect(p?.getAttribute('class')).toBeNull();
    expect(p?.getAttribute('dir')).toBeNull();
  });

  it('closing the dialog hides it again', async () => {
    renderCell('<p>Content</p>');
    await userEvent.click(screen.getByText('Content'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('preview click does not bubble to an ancestor row click handler', async () => {
    const onRowClick = vi.fn();
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <button type="button" onClick={onRowClick}>
          <HtmlFieldCell label="Description" rawValue="<p>Text</p>" />
        </button>
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText('Text'));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
