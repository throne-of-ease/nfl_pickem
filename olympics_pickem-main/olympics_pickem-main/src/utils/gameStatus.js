function parseOvertimeShootout(detailRaw) {
  const detail = String(detailRaw || '').toLowerCase();
  if (!detail) {
    return { hasOvertime: false, hasShootout: false };
  }

  const hasShootout = detail.includes('shootout') || /(^|[^a-z])so([^a-z]|$)/.test(detail);
  const hasOvertime = detail.includes('overtime') || /(^|[^a-z])ot([^a-z]|$)/.test(detail);

  return { hasOvertime, hasShootout };
}

export function hasOvertimeOrShootoutDetail(detailRaw) {
  const { hasOvertime, hasShootout } = parseOvertimeShootout(detailRaw);
  return hasOvertime || hasShootout;
}

export function isFinalOvertimeOrShootout(game) {
  const statusState = typeof game?.status === 'string' ? game.status : game?.status?.state;
  if (statusState !== 'final') {
    return false;
  }

  const detailRaw = game?.status_detail ?? game?.status?.detail ?? '';
  return hasOvertimeOrShootoutDetail(detailRaw);
}

export function getFinalLabel(game) {
  const statusState = typeof game?.status === 'string' ? game.status : game?.status?.state;
  if (statusState !== 'final') {
    return null;
  }

  const detailRaw = game?.status_detail ?? game?.status?.detail ?? '';
  const { hasOvertime, hasShootout } = parseOvertimeShootout(detailRaw);

  if (hasShootout) {
    return 'FINAL/SO';
  }
  if (hasOvertime) {
    return 'FINAL/OT';
  }

  return 'FINAL';
}
