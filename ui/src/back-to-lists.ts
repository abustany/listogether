import { useLocation, useNavigate } from "@solidjs/router";

// History state for pages opened from the lists page. Pass it to every
// navigation from the lists page.
export const fromListsState = { fromLists: true };

// Returns a click handler for "back to lists" links. Use it on an <A href="/">.
//
// If the lists page opened the current page, the handler goes back in history.
// A link to "/" would add a new history entry instead.
//
// Otherwise (for example, the app was opened from a shared link), there is no
// lists page to go back to, so the handler replaces the current history entry
// with the lists page.
export function useBackToLists(): (ev: MouseEvent) => void {
  const location = useLocation<Partial<typeof fromListsState> | undefined>();
  const navigate = useNavigate();

  return (ev) => {
    // Let the browser handle clicks that open the link in a new tab or window.
    if (ev.button !== 0 || ev.metaKey || ev.altKey || ev.ctrlKey || ev.shiftKey) return;

    ev.preventDefault();
    if (location.state?.fromLists) {
      window.history.back();
    } else {
      navigate("/", { replace: true });
    }
  };
}
