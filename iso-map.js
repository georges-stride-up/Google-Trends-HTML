// Minimal ISO3166 alpha-2 to friendly name mapper (expand as needed)
module.exports = {
  US: 'united-states',
  FR: 'france',
  DE: 'germany',
  GB: 'united-kingdom',
  // add more as needed
  toFriendly: function(code){
    if (!code) return 'allgeo';
    return (this[code.toUpperCase()] || String(code).toLowerCase());
  }
};
