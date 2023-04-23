/**
 * This script handles the creation and interaction of an Aladin Lite sky map.
 * It supports adding targets to the map through user input, TIC ID, or uploading a CSV file.
 * 
 * Dependencies:
 * - Aladin Lite: https://aladin.u-strasbg.fr/AladinLite/
 * - jQuery: https://jquery.com/
 * 
 * Functions:
 * - add_target_to_sky_map(aladin, aladinOverlay, ra, dec, target_name, color)
 *   Adds a target marker to the sky map, along with a circle around the target.
 * 
 * - handle_uploaded_csv(aladin, uploaded_csv_file)
 *   Reads the uploaded CSV file, extracts target information, and adds targets to the sky map.
 * 
 * Events:
 * - Form submission event
 *   Handles user input for target name, RA/DEC coordinates, or TIC ID, and adds targets to the sky map.
 *   Also, handles the uploading of a CSV file containing target information.
 */


// Create an overlay to draw circles around targets and a catalog to store the target markers
var aladinOverlay = A.graphicOverlay({ color: "#ee2345", lineWidth: 3 });
var aladinCatalog = A.catalog({ name: "Targets", onClick: "showPopup" });

/**
 * Adds a target marker to the sky map, along with a circle around the target.
 *
 * @param {Object} aladin - The Aladin Lite instance.
 * @param {Object} aladinOverlay - The Aladin Lite overlay instance.
 * @param {number} ra - The right ascension of the target.
 * @param {number} dec - The declination of the target.
 * @param {string} target_name - The name of the target.
 * @param {string} [color="blue"] - The color of the marker.
 */

function add_target_to_sky_map(
  aladin,
  aladinOverlay,
  ra,
  dec,
  target_name,
  color = "blue"
) {
  var coord = new Coo(ra, dec, "deg");

  if (!target_name) {
    target_name = "Unnamed Target";
  }

  // Use built-in marker with specified color
  var source = A.marker(coord, {
    popupTitle: target_name,
    popupDesc: "RA: " + ra.toFixed(6) + ", Dec: " + dec.toFixed(6),
    color: color,
  });
  aladinCatalog.addSources([source]);

  // Add a circle around the target
  aladinOverlay.add(A.circle(ra, dec, 0.04, { color: "red" }));
}

/**
 * Reads the uploaded CSV file, extracts target information, and adds targets to the sky map.
 *
 * @param {Object} aladin - The Aladin Lite instance.
 * @param {File} uploaded_csv_file - The uploaded CSV file containing target information.
 */

function handle_uploaded_csv(aladin, uploaded_csv_file) {
  // Make an AJAX request to your Flask route with the uploaded CSV file
  var formData = new FormData();
  formData.append("csv_file", uploaded_csv_file);

  $.ajax({
    url: "/csv_upload",
    type: "POST",
    data: formData,
    processData: false,
    contentType: false,
    success: function (data) {
      console.log("Data received from server:", data);

      // Create a new catalog object and add it to Aladin Lite
      aladinCatalog = A.catalog({ name: "Targets", onClick: "showPopup" });
      aladin.addCatalog(aladinCatalog);

      var sumRa = 0;
      var sumDec = 0;
      var numTargets = data.length;

      /**
 * Processes a single target, adds it to the sky map, and updates the RA and DEC sums.
 *
 * @param {Object} target - The target object containing target information.
 * @param {number} ra - The right ascension of the target.
 * @param {number} dec - The declination of the target.
 */
      function processTarget(target, ra, dec) {
        console.log("Adding target to sky map:", target);
        add_target_to_sky_map(
          aladin,
          aladinOverlay,
          ra,
          dec,
          target.target_name,
          "red"
        );
        sumRa += parseFloat(ra);
        sumDec += parseFloat(dec);

        // Check if all targets have been processed
        if (aladinCatalog.getSources().length === numTargets) {

          // Calculate the average RA and DEC, and move the sky map to that position
          var avgRa = sumRa / numTargets;
          var avgDec = sumDec / numTargets;
          aladin.gotoRaDec(avgRa, avgDec);
        }
      }

      // Loop through the returned targets
      data.forEach(function (target) {
        if (target.ra && target.dec) {
          // If target has RA and DEC, call processTarget immediately
          processTarget(target, target.ra, target.dec);
        } else if (target.target_name) {
          // If target has a target name, resolve it to RA and DEC using aladin.gotoObject
          aladin.gotoObject(target.target_name, function (found) {
            if (found) {
              var ra = aladin.view.getRa();
              var dec = aladin.view.getDec();
              processTarget(target, ra, dec);
            } else {
              console.error(
                "Error: Target name not found:",
                target.target_name
              );
            }
          });
        } else if (target.tic_id) {
          // If target has a TIC ID, make an AJAX request to the /lookup_tic Flask route
          $.ajax({
            url: "/lookup_tic",
            method: "POST",
            data: { tic_id: "TIC " + target.tic_id },
            success: function (data) {
              var ra = data.ra;
              var dec = data.dec;
              processTarget(target, ra, dec);
            },
            error: function () {
              console.error("Error: TIC ID not found:", target.tic_id);
            },
          });
        }
      });
    },

    error: function (jqXHR, textStatus, errorThrown) {
      console.error("Error uploading CSV file:", textStatus, errorThrown);
    },
  });
}

// Initialize the Aladin Lite instance with the given target and settings
var target = "{{ target }}";
var aladin = A.aladin("#aladin-lite-div", {
  target: target,
  fov: 0.5,
  survey: "P/DSS2/color",
  reticleColor: "#ffeb3b",
  reticleSize: 22,
});

// Add the catalog and overlay to the Aladin Lite instance
aladin.addCatalog(aladinCatalog);
aladin.addOverlay(aladinOverlay);

// Set up the form submission event to handle user input
$("form").submit(function (event) {
  event.preventDefault(); // Prevent the default form submission behavior
  target = $("#target").val(); // Get the target input value from the form
  console.log("Form submitted, target:", target);

  // Prepare the FormData object for a potential CSV file upload
  var formData = new FormData();
  formData.append("csv_file", $("#csv-file")[0].files[0]);

  // If a target is provided, handle the input based on its format
  if (target) {
    //handling target input (RA/Dec, TIC ID, or name) checking input format
    var raDecPattern = /^(\s*-?\d+(\.\d*)?)\s*,\s*(-?\d+(\.\d*)?)\s*$/;
    var raDecMatch = target.match(raDecPattern);

    if (raDecMatch) {
      var ra = parseFloat(raDecMatch[1]);
      var dec = parseFloat(raDecMatch[2]);
      aladin.gotoRaDec(ra, dec);
      add_target_to_sky_map(aladin, aladinOverlay, ra, dec, target, "red");
    }
    // Check if the input is a TIC ID (assuming it starts with 'TIC') or a number
    else if (target.toUpperCase().startsWith("TIC") || !isNaN(target)) {
      if (!target.toUpperCase().startsWith("TIC")) {
        target = "TIC " + target;
      }
      console.log("Submitting TIC ID request:", target);
      $.ajax({
        url: "/lookup_tic",
        method: "POST",
        data: { tic_id: target },
        success: function (data) {
          var ra = data.ra;
          var dec = data.dec;
          aladin.gotoRaDec(ra, dec);
          add_target_to_sky_map(aladin, aladinOverlay, ra, dec, target, "red");
        },
        error: function () {
          alert("Error: TIC ID not found");
        },
      });
    } else {
      // Handle target name input
      console.log("Trying to resolve target name:", target);
      aladin.gotoObject(target);

      // Use setTimeout() to delay the execution of the code after the view has updated
      setTimeout(function () {
        var raDec = aladin.getRaDec();
        var ra = raDec[0];
        var dec = raDec[1];

        // Check if the target is within the view after the delay
        if (Math.abs(aladin.getFov()[0]) >= 0.0001) {
          console.log("Target name found:", target);
          add_target_to_sky_map(aladin, aladinOverlay, ra, dec, target, "red");
        } else {
          console.error("Error: Target name not found:", target);
          alert("Error: Target name not found");
        }
      }, 1000); // Adjust the delay as needed (in milliseconds)
    }
  }

  // If a CSV file is uploaded, handle the file and add markers to the sky map
  if ($("#csv-file")[0].files[0]) {
    // Call handle_uploaded_csv() function to upload CSV file and add markers to the sky map
    handle_uploaded_csv(aladin, $("#csv-file")[0].files[0]);
  }
});
