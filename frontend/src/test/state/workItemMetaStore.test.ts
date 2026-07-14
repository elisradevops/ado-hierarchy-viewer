import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkItemMetaStore } from '../../state/workItemMetaStore';

describe('workItemMetaStore.setMeta', () => {
  beforeEach(() => {
    useWorkItemMetaStore.getState().clear();
  });

  it('derives the chip color from the icon URL when the two ADO fields disagree (confirmed real-world repro)', () => {
    // Repro: Requirement's WorkItemType.color (pink) was stale on a real on-prem
    // instance; the icon's baked-in color (teal, #2496C4) matched the actual
    // process configuration. The icon's embedded color wins; WorkItemType.color
    // is only a fallback for types with no icon URL.
    useWorkItemMetaStore.getState().setMeta({
      types: [
        {
          name: 'Requirement',
          color: '#e91e8c',
          iconUrl: 'https://ado.example/_apis/wit/workItemIcons/icon_list?color=2496C4&v=2',
        },
      ],
      stateColors: {},
    });

    const { typeColors, typeIconUrls } = useWorkItemMetaStore.getState();
    expect(typeColors['Requirement']).toBe('#2496C4');
    expect(typeIconUrls['Requirement']).toBe('https://ado.example/_apis/wit/workItemIcons/icon_list?color=2496C4&v=2');
  });

  it('falls back to WorkItemType.color when the icon URL has no color param', () => {
    useWorkItemMetaStore.getState().setMeta({
      types: [{ name: 'Task', color: '#F2CB1D', iconUrl: 'https://ado.example/icon?api-version=7.1' }],
      stateColors: {},
    });
    expect(useWorkItemMetaStore.getState().typeColors['Task']).toBe('#F2CB1D');
  });

  it('leaves the icon URL absent when the API supplies no iconUrl', () => {
    useWorkItemMetaStore.getState().setMeta({
      types: [{ name: 'Task', color: '#F2CB1D', iconUrl: '' }],
      stateColors: {},
    });
    expect(useWorkItemMetaStore.getState().typeIconUrls['Task']).toBeUndefined();
    expect(useWorkItemMetaStore.getState().typeColors['Task']).toBe('#F2CB1D');
  });

  it('clear() resets both color and icon-url maps', () => {
    useWorkItemMetaStore.getState().setMeta({
      types: [{ name: 'Bug', color: '#CC293D', iconUrl: 'https://ado.example/icon?color=CC293D' }],
      stateColors: {},
    });
    useWorkItemMetaStore.getState().clear();
    const { typeColors, typeIconUrls } = useWorkItemMetaStore.getState();
    expect(typeColors).toEqual({});
    expect(typeIconUrls).toEqual({});
  });
});
