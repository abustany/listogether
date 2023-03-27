describe("List creation and deletion", () => {
  before(() => {
    cy.clearDB();
  });

  it("creates and deletes a list", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /New list/ }).click();
    cy.findByPlaceholderText("List name").click().clear().type("Test list");
    cy.findByRole("link", { name: /Back to lists/ }).click();
    cy.findByRole("listitem", { name: "Test list" }).should("exist");

    cy.findByRole("button", { name: "Delete this list" }).click();
    cy.findByRole("button", { name: "Click to confirm" }).click();

    cy.findByRole("listitem", { name: "Test list" }).should("not.exist");
    cy.findByText("No list yet!").should("exist");
  });
});
