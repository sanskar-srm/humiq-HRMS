export const ok = (res, data, message = 'Request completed successfully', meta) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
};

export const created = (res, data, message = 'Resource created successfully') =>
  res.status(201).json({ success: true, message, data });

export const noContent = (res, message = 'Request completed successfully') =>
  res.status(200).json({ success: true, message });

export const paginated = (res, data, { page, limit, total }, message = 'Records retrieved successfully') =>
  res.status(200).json({
    success: true,
    message,
    data,
    meta: { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 },
  });

export const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
};
