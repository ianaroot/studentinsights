(function(root) {

  /*
  This owns a piece of the DOM rendered by Rails.  It takes an initial list of `interventions` 
  and then owns that state and any changes to it over time.
  
  This class expects a few Mustache templates to be available on the page (see constructor).

  The structure of this class is to:
  - take a DOM element to render into, and some initial state
  - store state as instance variables
  - bind any event listeners once
  - call `render` to project the state onto the page
  - use client-side templates to do the rendering
  - when a user action occurs, update state in instances variables and re-render

  It's similar to a Backbone View, and the main flow of data is the same as a single
  React component.  An exception is the forms that are rendered.  The state in the input elements
  is not preserved, so if a server error occurs saving the form, the error message are
  inserted into the DOM without a full render.
  */  
  var InterventionsController = function (options) {
    this.initialize(options);
  };

  InterventionsController.readTemplatesFromPage = function($el) {
    // templates, these should be available on the page (or could be compiled and provided
    // as a JS asset)
    return {
      main: $('#main-interventions-template').html(),
      interventionCell: $('#intervention-cell-template').html(),
      interventionDetails: $('#intervention-detail-template').html(),
      newInterventionForm: $('#new-intervention-form-template').html(),
      progressNote: $('#progress-note-template').html(),
      newProgressNote: $('#new-progress-note-template').html(),
      errors: $('#form-errors-template').html()
    };
  };

  _.extend(InterventionsController.prototype, {
    // Expects: {$el, studentId, interventions, templates, educators}
    // Optional: {datepickerOptions}
    initialize: function(options) {
      this.options = options;
      this.$el = this.options.$el;
      this.templates = this.options.templates;

      // state
      this.studentId = this.options.studentId;
      this.interventions = this.options.interventions;
      this.selectedInterventionId = this.defaultSelectedIntervention();
      this.isShowingNewIntervention = (this.interventions.length === 0); // show 'add' if no interventions
      this.isAddingProgressNote = false;
    },

    defaultSelectedIntervention: function() {
      return (this.interventions.length === 0)
        ? null
        : this.interventions[0].id
    },

    // Helper for reading value from state
    getSelectedIntervention: function() {
      if (this.selectedInterventionId === null) {
        return null;
      }
      return _.findWhere(this.interventions, { id: this.selectedInterventionId });
    },

    // This binds event listeners for user actions, and for events fired by the jquery-ujs
    // Rails code that is adding behavior to HTML generated with `form_for` server rendering.
    bindListeners: function () {
      // interventions
      this.$el.on('click', '#open-intervention-form', this.onAddNewIntervention.bind(this));
      this.$el.on('click', '#close-intervention-form', this.onCancelNewIntervention.bind(this));
      this.$el.on('click', '.intervention-cell', this.onSelectedIntervention.bind(this));
      this.$el.on('ajax:success', '.new-intervention-form', this.onNewInterventionSaveSucceeded.bind(this));
      this.$el.on('ajax:error', '.new-intervention-form', this.onNewInterventionSaveFailed.bind(this));

      // progress notes
      this.$el.on('click', '.add-progress-note', this.onNewProgressNoteClicked.bind(this));
      this.$el.on('click', '.cancel-progress-note', this.onCancelNewProgressNote.bind(this));
      this.$el.on('ajax:success', '.new-progress-note-form', this.onNewProgressNoteSaveSucceeded.bind(this));
      this.$el.on('ajax:error', '.new-progress-note-form', this.onNewProgressNoteSaveFailed.bind(this));
    },

    onNewProgressNoteClicked: function(e) {
      this.isAddingProgressNote = true;
      this.render();
    },

    onCancelNewProgressNote: function(e) {
      this.isAddingProgressNote = false;
      this.render();
    },

    onSelectedIntervention: function (e) {
      var interventionId = $(e.currentTarget).data('id');
      this.selectedInterventionId = interventionId;
      this.isAddingProgressNote = false;
      this.isShowingNewIntervention = false;
      this.render();
    },

    onAddNewIntervention: function (e) {
      this.selectedInterventionId = null;
      this.isShowingNewIntervention = true;
      this.render();
    },

    onCancelNewIntervention: function (e) {
      this.selectedInterventionId = this.defaultSelectedIntervention();
      this.isShowingNewIntervention = false;
      this.render();
    },

    onNewInterventionSaveSucceeded: function (e, data, status, xhr) {
      this.interventions = [data].concat(this.interventions);
      this.selectedInterventionId = this.defaultSelectedIntervention();
      this.isShowingNewIntervention = false;
      this.render();
    },

    onNewProgressNoteSaveSucceeded: function(e, data, status, xhr) {
      var intervention = this.getSelectedIntervention();
      intervention.progress_notes = intervention.progress_notes.concat([data]);
      this.isAddingProgressNote = false;
      this.render();
    },

    onNewProgressNoteSaveFailed: function(e, xhr, status, error) {
      var $errorsEl = $(e.currentTarget).parent().find('.alert.errors');
      this.insertErrorMessages($errorsEl, xhr.responseJSON.errors);
    },

    onNewInterventionSaveFailed: function(e, xhr, status, error) {
      var $errorsEl = $(e.currentTarget).parent().find('.alert.errors');
      this.insertErrorMessages($errorsEl, xhr.responseJSON.errors);
    },

    // This inserts the errors into the form to preserve the DOM state on the form,
    // rather than doing a full render that would lose that.
    insertErrorMessages: function($targetEl, errors) {
      var html = Mustache.render(this.templates.errors, { errors: errors });
      $targetEl.html(html);
    },

    render: function () {
      this.$el.html(Mustache.render(this.templates.main, {}));
      this.$el.find('.intervention-cell-list').html(this.renderInterventionCells());
      this.$el.find('.intervention-details-list').html(this.renderInterventionDetails());
      this.$el.find('.new-intervention-container').html(this.renderNewInterventionForm());
      this.$el.find('.progress-notes-list').html(this.renderProgressNotes());
      this.$el.find('.new-progress-note-area').html(this.renderNewProgressNote());
      this.$el.find('.datepicker').datepicker(this.options.datepickerOptions || {});
    },

    renderInterventionCells: function () {
      var htmlPieces = this.interventions.map(function(intervention) {
        var activatedClass = (intervention.id === this.selectedInterventionId) ? 'activated' : '';
        return Mustache.render(this.templates.interventionCell, _.assign({}, intervention, { activatedClass: activatedClass }));
      }, this);
      return htmlPieces.join('');
    },

    renderInterventionDetails: function () {
      if (this.interventions.length === 0) return '<div class="zero-interventions">No interventions.</div>';
      var intervention = this.getSelectedIntervention();
      if (intervention === null) return '';
      return Mustache.render(this.templates.interventionDetails, intervention);
    },

    renderNewInterventionForm: function() {
      return (this.isShowingNewIntervention)
        ? Mustache.render(this.templates.newInterventionForm, { studentId: this.studentId })
        : '';
    },

    renderProgressNotes: function() {
      var intervention = this.getSelectedIntervention();
      if (intervention === null) return '';
      var htmlPieces = intervention.progress_notes.map(function(progressNote) {
        return Mustache.render(this.templates.progressNote, progressNote);
      }, this);
      return htmlPieces.join('');
    },

    renderNewProgressNote: function() {
      return Mustache.render(this.templates.newProgressNote, {
        interventionId: this.selectedInterventionId,
        isAddingProgressNote: this.isAddingProgressNote,
        educators: this.options.educators
      });
    }
  });

  root.InterventionsController = InterventionsController;

})(window)
