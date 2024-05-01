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

// Function to populate the family dropdown
function populateFamilyDropdown() {
  var families = {};
  brothers.forEach(function(brother) {
    if (brother.familystarted && !families[brother.familystarted]) {
      families[brother.familystarted] = true;
      $('#familyFilter').append($('<option>', {
        value: brother.familystarted,
        text: brother.familystarted
      }));
    }
  });
}

function draw() {
  createNodes();  // Initialize nodes and edges if not done already.

  var selectedFamily = $('#familyFilter').val();  // Get the selected family from the dropdown.
  var activeNodes = (selectedFamily === 'all') ? nodes : nodes.filter(function(node) {
    return node.family.toLowerCase() === selectedFamily.toLowerCase();
  });
  var activeEdges = [];

  // Collect edges that connect the filtered nodes
  activeNodes.forEach(function(node) {
    edges.forEach(function(edge) {
      if (edge.from === node.id || edge.to === node.id) {
        activeEdges.push(edge);
      }
    });
  });

  // Re-initialize the datasets with filtered nodes and edges
  nodesDataSet = new vis.DataSet(activeNodes);
  edgesDataSet = new vis.DataSet(activeEdges);

  updateNetwork();  // Use the current nodesDataSet and edgesDataSet to update the visualization
  applyColorScheme();  // Apply the color scheme based on the current selection in the dropdown
}

function applyColorScheme() {
  var colorMethod = $('#layout').val();

  nodesDataSet.forEach(function(node) {
    switch (colorMethod) {
      case 'active':
        node.color = (node.inactive || node.graduated) ? 'lightgrey' : 'lightblue';
        break;
      case 'pledgeClass':
        node.color = node.pledgeclass ? pledgeClassColor[node.pledgeclass.toLowerCase()] : 'lightgrey';
        break;
      default: // 'family'
        node.color = familyColor[node.family.toLowerCase()];
        break;
    }
    nodesDataSet.update(node);
  });

  if (network) {
    network.redraw();
  }
}

function updateNetwork() {
  var container = document.getElementById('mynetwork');
  var data = {
    nodes: nodesDataSet,
    edges: edgesDataSet,
  };
  var options = {
    layout: {
      hierarchical: {
        sortMethod: 'directed',
      },
    },
    edges: {
      smooth: true,
      arrows: { to: true },
    },
  };

  if (network) {
    network.destroy();
  }

  network = new vis.Network(container, data, options);
}

if (typeof document !== 'undefined') {
  $(document).ready(function () {
    // Populate the family dropdown immediately after the data is available
    populateFamilyDropdown();

    // Setup change event handler for the family filter and layout dropdown
    $('#familyFilter, #layout').change(draw);

    // Setup the search feature
    $('#searchbutton').click(search);
    $('#searchbox').keypress(function (e) {
      var keyCode = e.which || e.keyCode;
      if (keyCode === 13) { // Enter key
        search();
      }
    });

    // Initial draw of the network
    draw();
  });
}

function search() {
  var query = $('#searchbox').val();
  var success = findBrother(query);

  // Indicate if the search succeeded or not
  if (success) {
    $('#searchbox').css('background-color', 'white');
  } else {
    $('#searchbox').css('background-color', '#EEC4C6'); // Red matching flag for no match found
  }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports.createNodes = createNodes;
}
