/* global vis, tinycolor, brothers, $, didYouMean */

// Mock out dependencies for testing on NodeJS. These are imported in HTML in
// the browser.
/* eslint-disable */
if (typeof brothers === 'undefined') {
  brothers = require('./relations');
}
if (typeof tinycolor === 'undefined') {
  tinycolor = require('tinycolor2');
}
if (typeof $ === 'undefined') {
  $ = require('jquery');
}
if (typeof vis === 'undefined') {
  vis = require('vis');
}
if (typeof didYouMean === 'undefined') {
  didYouMean = require('didyoumean');
}
/* eslint-enable */

var network = null;

var createNodesCalled = false;
var nodes = [];
var edges = [];
var nodesDataSet;
var edgesDataSet;
var UNKNOWN_BIG_BRO = 'UNKNOWN';
var unknownNode;

var familyColor = {};
var pledgeClassColor = {};

function ColorSpinner(colorObj, spinAmount) {
  this.spinAmount = spinAmount;
  this.color = new tinycolor(colorObj);
}
ColorSpinner.prototype.spin = function () {
  this.color = this.color.spin(this.spinAmount);
  return this.color.toHexString();
};

var getNewFamilyColor = (function () {
  var spinner1 = new ColorSpinner({ h: 0, s: 0.6, v: 0.9 }, 77);
  return function () {
    return spinner1.spin();
  };
}());

var getNewPledgeClassColor = (function () {
  var spinner2 = new ColorSpinner({ h: 0, s: 0.4, v: 0.9 }, 23);
  return function () {
    return spinner2.spin();
  };
}());

function didYouMeanWrapper(name) {
  // We only compute the nameList in the case we call this. This should be
  // uncommon, because it indicates we've already hit an unrecoverable
  // data-entry bug.
  var nameList = brothers.map(function (bro) {
    return bro.name;
  });
  return didYouMean(name, nameList);
}

// Only call this once (for effiencency & correctness)
function createNodes() {
  if (createNodesCalled) return;
  createNodesCalled = true;

  var oldLength = brothers.length;
  var newIdx = oldLength;

  var familyToNode = {};
  for (var i = 0; i < oldLength; i++) {
    var bro = brothers[i];
    bro.id = i;

    var lowerCaseFamily = (bro.familystarted || '').toLowerCase();
    if (lowerCaseFamily && !familyColor[lowerCaseFamily]) {
      // Add a new family
      familyColor[lowerCaseFamily] = getNewFamilyColor();

      // Create a root for that family
      var newNode = {
        id: newIdx++, // increment
        name: lowerCaseFamily,
        label: bro.familystarted,
        family: lowerCaseFamily,
        inactive: true, // a family does not count as an active undergraduate
        font: { size: 50 }, // super-size the font
      };
      familyToNode[lowerCaseFamily] = newNode;
      nodes.push(newNode);
    }

    if (bro.big && lowerCaseFamily) {
      // This person has a big bro, but they also started a new family of their
      // own, so let's put them in both spots

      // Create a placeholder node under his big bro
      edges.push({ from: bro.big, to: newIdx });
      nodes.push(Object.assign({}, bro, {
        id: newIdx++, // increment
        name: '', // some non-existing name
        label: '[' + bro.name + ']',
        family: bro.familystarted.toLowerCase(),
      }));

      // Create the real node under his family
      edges.push({ from: familyToNode[lowerCaseFamily].id, to: bro.id });
    } else if (!bro.big && !lowerCaseFamily) {
      // This is a data entry error: everyone should have a big bro, or should
      // have started a family. For now, just add some default value for both.
      bro.big = UNKNOWN_BIG_BRO.toLowerCase();

      if (!unknownNode) {
        // And add a placeholder family node
        familyColor[UNKNOWN_BIG_BRO.toLowerCase()] = getNewFamilyColor();
        unknownNode = {
          id: newIdx++, // increment
          name: UNKNOWN_BIG_BRO.toLowerCase(),
          label: UNKNOWN_BIG_BRO,
          family: UNKNOWN_BIG_BRO.toLowerCase(),
          inactive: true,
          font: { size: 50 }, // super-size the font
        };
        familyToNode[UNKNOWN_BIG_BRO.toLowerCase()] = unknownNode;
        nodes.push(unknownNode);
      }
      edges.push({ from: unknownNode.id, to: bro.id });
    } else if (lowerCaseFamily) {
      // This person founded a family, and has no big bro, so put his node
      // directly underneath the family node
      edges.push({ from: familyToNode[lowerCaseFamily].id, to: bro.id });
    } else {
      // This person is just a regular brother
      edges.push({ from: bro.big, to: bro.id });
    }
    bro.big = bro.big || lowerCaseFamily;

    var lowerCaseClass = (bro.pledgeclass || '').toLowerCase();
    if (lowerCaseClass && !pledgeClassColor[lowerCaseClass]) {
      // Add a new Pledge Class
      pledgeClassColor[lowerCaseClass] = getNewPledgeClassColor();
    }

    bro.label = bro.name; // Display the name in the graph

    nodes.push(bro); // Add this to the list of nodes to display
  }

  var nameToNode = {};
  // Change .big from a string to a link to the big brother node
  nodes.forEach(function (member) {
    if (member.big) {
      if (nameToNode[member.big]) {
        member.big = nameToNode[member.big];
      } else {
        nodes.forEach(function (member2) {
          if (member.big === member2.name) {
            nameToNode[member.big] = member2;
            member.big = member2;
          }
        });
      }
    }
  });

  // Fix the edges (that point from strings instead of node IDs)
  edges.forEach(function (edge) {
    if (typeof edge.from === 'string') {
      var name = edge.from;
      var node = nameToNode[name];
      /* istanbul ignore next */
      if (!node) {
        var correctedName = didYouMeanWrapper(name);
        var msg;
        if (!correctedName) {
          msg = 'Unable to find a match for '
            + JSON.stringify(name);
        } else if (name.trim() === correctedName.trim()) {
          msg = 'Inconsistent whitespace. Expected to find '
            + JSON.stringify(correctedName)
            + ', but actually found ' + JSON.stringify(name) + '. These should '
            + 'have consistent whitespace.';
        } else {
          msg = 'Unable to find ' + JSON.stringify(name)
            + ', did you mean ' + JSON.stringify(correctedName)
            + '?';
        }
        throw new Error(msg);
      }
      edge.from = node.id;
    }
  });

  function getFamily(node) {
    node.family = node.family || node.familystarted;
    if (node.family) return node.family;
    try {
      node.family = getFamily(node.big);
    } catch (e) {
      node.family = 'unknown';
    }

    return node.family;
  }

  // re-process the brothers
  // Color all the nodes (according to this color scheme)
  nodes.forEach(function (node) {
    // Get the family information
    getFamily(node);

    // Mark the family as active (if it has 1 or more active members)
    if (!node.inactive && !node.graduated) {
      familyToNode[node.family.toLowerCase()].inactive = false;
    }
  });

  nodesDataSet = new vis.DataSet(nodes);
  edgesDataSet = new vis.DataSet(edges);
}

/**
 * Searches for the specific brother (case-insensitive, matches any substring).
 * If found, this zooms the network to focus on that brother's node.
 *
 * Returns whether or not the search succeeded. This always returns `true` for
 * an empty query.
 */
function findBrother(name) {
  if (!name) return true; // Don't search for an empty query.
  // This requires the network to be instantiated, which implies `nodes` has
  // been populated.
  if (!network) return false;

  var lowerCaseName = name.toLowerCase();
  var found = nodes.find(function (element) {
    // return element.name === name;
    return element.name.toLowerCase().includes(lowerCaseName);
  });
  if (found) {
    network.focus(found.id, {
      scale: 0.9,
      animation: true,
    });
    network.selectNodes([found.id]);
    return true;
  }
  return false; // Could not find a match
}

// This populates the dropdown with the family names for the HTML page
function populateFamilyDropdown() {
  var uniqueFamilies = {}; // Object to store unique families
  brothers.forEach(function (bro) {
    if (bro.familystarted) { // Check if familystarted exists and is not an empty string
      var familyKey = bro.familystarted.toLowerCase(); // Normalize to lower case to ensure uniqueness
      if (!uniqueFamilies[familyKey]) {
        uniqueFamilies[familyKey] = true;
        $('#familyFilter').append($('<option>', {
          value: familyKey,
          text: bro.familystarted
        }));
      }
    }
  });
}

function applyColorScheme() {
  var colorMethod = $('#layout').val(); // Get the current method of coloring

  nodesDataSet.forEach(function (node) {
    var nodeColor;
    switch (colorMethod) {
      case 'active':
        nodeColor = (node.inactive || node.graduated) ? 'lightgrey' : 'lightblue';
        break;
      case 'pledgeClass':
        nodeColor = node.pledgeclass ? pledgeClassColor[node.pledgeclass.toLowerCase()] : 'lightgrey';
        break;
      default: // 'family'
        nodeColor = familyColor[node.family.toLowerCase()];
        break;
    }
    nodesDataSet.update({
      id: node.id,
      color: nodeColor
    });
  });

  if (network) {
    network.redraw(); // Redraw the network to apply color changes
  }
}

function updateNetwork() {
  var container = document.getElementById('mynetwork');
  var data = {
    nodes: nodesDataSet,
    edges: edgesDataSet
  };
  var options = {
    layout: {
      hierarchical: {
        sortMethod: 'directed'
      }
    },
    edges: {
      smooth: true,
      arrows: {
        to: true
      }
    }
  };

  if (network) {
    network.destroy(); // If there is already a network, destroy it before recreating it
  }
  network = new vis.Network(container, data, options);
}

function draw() {
  createNodes(); // Initialize nodes and edges if needed

  var selectedFamily = $('#familyFilter').val().toLowerCase(); // Get the selected family from dropdown
  var visibleNodes = selectedFamily === 'all' ? nodes : nodes.filter(function (node) {
    return node.family && node.family.toLowerCase() === selectedFamily;
  });

  var visibleEdges = edges.filter(function (edge) {
    var fromFound = false;
    var toFound = false;
    for (var i = 0; i < visibleNodes.length; i++) {
      if (visibleNodes[i].id === edge.from) {
        fromFound = true;
      }
      if (visibleNodes[i].id === edge.to) {
        toFound = true;
      }
      if (fromFound && toFound) break; // Stop loop early if both nodes are found
    }
    return fromFound && toFound;
  });

  nodesDataSet.clear();
  edgesDataSet.clear();
  nodesDataSet.add(visibleNodes);
  edgesDataSet.add(visibleEdges);

  updateNetwork();
  applyColorScheme(); // Ensure color scheme is applied
}

if (typeof document !== 'undefined') {
  $(document).ready(function () {
    populateFamilyDropdown();
    draw(); // Initial draw

    $('#familyFilter').change(function () {
      draw(); // Redraw when family selection changes
    });
    $('#layout').change(function () {
      draw(); // Redraw when color coding changes
    });

    // Set up search functionality
    $('#searchbutton').click(function () {
      var query = $('#searchbox').val();
      var success = findBrother(query);

      // Update the search box color based on success
      if (success) {
        $('#searchbox').css('background-color', 'white');
      } else {
        $('#searchbox').css('background-color', '#EEC4C6'); // Red matching flag
      }
    });

    $('#searchbox').keypress(function (e) {
      var keyCode = e.which || e.keyCode;
      if (keyCode === 13) { // Enter key
        $('#searchbutton').click();
      }
    });
  });
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports.createNodes = createNodes;
}
