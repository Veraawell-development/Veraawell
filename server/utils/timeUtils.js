const parseTime = (timeStr) => {
  if (!timeStr) return [0, 0];
  let [ch, cm] = timeStr.split(':');
  let hours = Number(ch);
  const min = parseInt(cm);
  if (cm.includes('PM') && hours < 12) hours += 12;
  if (cm.includes('AM') && hours === 12) hours = 0;
  return [hours, min];
};

module.exports = { parseTime };
