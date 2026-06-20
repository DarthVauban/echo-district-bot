function serializeDetails(details) {
  if (!details) {
    return '';
  }

  const normalized = details instanceof Error
    ? {
        name: details.name,
        message: details.message,
        stack: details.stack,
      }
    : details;

  try {
    return ` ${JSON.stringify(normalized)}`;
  } catch {
    return ' {"details":"unserializable"}';
  }
}

function write(level, message, details) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${serializeDetails(details)}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info(message, details) {
    write('info', message, details);
  },
  warn(message, details) {
    write('warn', message, details);
  },
  error(message, details) {
    write('error', message, details);
  },
};
