# FormSummary

The message "Revisa los campos marcados en rojo." placed directly above the submit button after a failed submit.

- Validate on submit, then scroll to and focus the first invalid field; the summary stays until the form is valid.
- `danger` text with an alert icon, announced (`role=alert`). Server-side errors that do not belong to a field ("Ya existe un documento con este número.") replace the generic copy here.
- Inside the sticky `ActionBar` it sits above the primary button.

The consumer provides: `visible`, optional `children` to replace the copy.
